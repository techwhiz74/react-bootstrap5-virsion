const d3 = require('d3');
const seedrandom = require('seedrandom');

import { mmToPixels } from './utils.js';
import { buildHierarchy } from './parse.js';

function drawFan(json, config) {
    
    const data = buildHierarchy(json, config);
    if (data == null) {
        window.alert(__('arbreomatic.cannot_read_this_file'));
        return null;
    }

    const radius = mmToPixels(Math.round((config.fanDimensions / 2)));
    // console.log("config.frameDimensions: ", config.frameDimensions);

    function max(a, b) {
        return a > b ? a : b;
    }

    function computeDepth(data) {
        if (data.hasOwnProperty("children"))
            return 1 + data.children.map(computeDepth).reduce(max, 0);
        else
            return 1;
    }

    const depth = computeDepth(data);

    const showMarriages = config.showMarriages;

    const weightRadiusFirst = config.weights.generations[0],
        weightRadiusClose = config.weights.generations[1],
        weightRadiusFar = config.weights.generations[2],
        weightRadiusMarriage = showMarriages ? 0.27 : 0; //FB
    const weightFontFirst = 0.25,
        weightFontOther = 0.22,
        weightFontDate = 0.19,
        weightFontMin = 0.16, // Threshold below which first names are abbreviated
        weightFontFar = 0.1,
        weightFontFurthest = 0.06,
        weightFontMarriage = 0.16;
    const thirdLevel = 4,
        fourthLevel = 5,
        fifthLevel = 6,
        sixthLevel = 7,
        seventhLayer = 8,
        eighthLayer = 9;
    const weightTextMargin = 0.115;

    const titleSize = 0.07 * radius * config.titleSize;
    const titleSpace = 0.1 * radius * config.titleMargin;

    function between(a, b) {
        return d => d.depth >= a && d.depth < b;
    }

    const isFirstLayer = between(0, 1),
        isSecondLayer = between(1, thirdLevel),
        isThirdLayer = between(thirdLevel, fourthLevel),
        isFourthLayer = between(fourthLevel, fifthLevel),
        isFifthLayer = between(fifthLevel, sixthLevel),
        isSixthLayer = between(sixthLevel, seventhLayer),
        isSeventhLayer = between(seventhLayer, eighthLayer),
        isEightsLayer = d => d.depth >= eighthLayer;

    let isMarriageFirst, isMarriageSecond;

    // config.angle > 6 = fan angle = 360°
    if (config.angle > 6) {
        isMarriageFirst = d => between(0, fifthLevel)(d) && d.children;
        isMarriageSecond = d => d.depth >= fifthLevel && d.children;
    } else {
        isMarriageFirst = d => between(0, fourthLevel)(d) && d.children;
        isMarriageSecond = d => d.depth >= fourthLevel && d.children;
    }

    // Optimized code
    function applyNormalWeights(tree) {
        const generationLimits = [1, thirdLevel, seventhLayer, Infinity];
        
        function computeRecursive(tree, generation) {
            let i = 0;
            while (generation >= generationLimits[i]) {
                i++;
            }
            tree.weight = config.weights.generations[i];
            if (tree.children) {
                tree.children.map(parent => computeRecursive(parent, generation + 1));
            }
        }
        computeRecursive(tree, 0);
    }

    function applyTimeWeights(tree) {
        const defaultAgeForBirth = 22,
            defaultAgeDead = 80,
            maxAgeAlive = 110; // TODO actually use these (for the first ind.)
        const minimumAgeForBirth = 14,
            maximumAgeForBirth = 60;
        let minimums = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];

        function computeRecursive(tree, year, generation) {
            let timeDifference = defaultAgeForBirth;
            const isYearDefined = tree.birth && tree.birth.date && tree.birth.date.year;
            if (isYearDefined) {
                timeDifference = year - tree.birth.date.year;
            }
            if (timeDifference < minimumAgeForBirth || timeDifference > maximumAgeForBirth) {
                timeDifference = defaultAgeForBirth;
            }
            if (generation === 0) { // For now
                timeDifference = defaultAgeForBirth;
            }

            tree.weight = timeDifference;
            let i;
            if (generation < 1) { // (1)
                i = 0;
            } else if (generation < thirdLevel) { // (2)
                i = 1;
            } else if (generation < seventhLayer) { // (3)
                i = 2;
            } else { // (4)
                i = 3;
            }
            minimums[i] = Math.min(timeDifference, minimums[i]);

            if (tree.children) {
                tree.children.map(parent => computeRecursive(parent, isYearDefined ? tree.birth.date.year : year - timeDifference, generation + 1));
            }
        }
        const baseYear = new Date().getFullYear();
        computeRecursive(tree, baseYear, 0);

        let maxScale = 0;
        for (let i = 0; i < minimums.length; i++) {
            const scale = (config.weights.generations[i] + (i > 0 ? weightRadiusMarriage : 0)) / minimums[i];
            maxScale = Math.max(scale, maxScale);
        }

        function normalizeRecursive(tree, generation) {
            if (generation === 0) {
                tree.weight *= maxScale;
            } else {
                tree.weight = tree.weight * maxScale - weightRadiusMarriage;
            }
            if (tree.children) {
                tree.children.map(parent => normalizeRecursive(parent, generation + 1));
            }
        }

        normalizeRecursive(tree, 0);
    }

    if (config.isTimeVisualisationEnabled)
        applyTimeWeights(data);
    else
        applyNormalWeights(data);

    function computeTotalWeight(tree, generation) {
        let currentWeight = tree.weight;
        if (generation > 0) {
            currentWeight += weightRadiusMarriage;
        }
        return currentWeight + (tree.children ? Math.max(...tree.children.map(parent => computeTotalWeight(parent, generation + 1))) : 0);
    }

    const totalWeight = computeTotalWeight(data, 0); // Math.min(depth, 1) * weightRadiusFirst + Math.max(Math.min(depth, thirdLevel) - 1, 0) * weightRadiusClose + Math.max(depth - thirdLevel, 0) * weightRadiusFar + (depth - 1) * weightRadiusMarriage;

    const angleInterpolate = config.angle / Math.PI - 1;
    //console.log(config.angle);
    const fixOrientations = true;

    // https://stackoverflow.com/a/5624139/4413709
    function hexToRgb(hex) {
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? result.slice(1, 4).map(n => parseInt(n, 16)) : null;
    }

    const individualsDefaultColorRgb = hexToRgb(config.colors.individuals),
        marriagesColorHex = config.colors.marriages;

    // Calculate polar coordinates
    function calculateNodeProperties(node) {
        const space = 2 * Math.PI - config.angle;
        if (node.parent == null) {
            node.x0 = Math.PI - space / 2;
            node.x1 = -Math.PI + space / 2;
            node.y0 = 0;
            node.y1 = node.data.weight;
        } else {
            let p = node.parent;
            let add = (p.x1 - p.x0) / 2;
            node.x0 = p.x0 + (node.data.sosa % 2 === 0 ? add : 0);
            node.x1 = node.x0 + add;
            node.y0 = p.y1 + weightRadiusMarriage;
            node.y1 = node.y0 + node.data.weight;
        }
    }
    
    let rootNode = d3.hierarchy(data).each(calculateNodeProperties);

    const id = 'svg#fan';
    $(id).empty(); // Clear current contents, if any

    const width = 2 * radius,
        height = radius + Math.max(radius * Math.cos(Math.PI - config.angle / 2), radius * weightRadiusFirst / totalWeight);
    const hasTitle = config.title.length > 0;
    const titleBlock = hasTitle ? titleSize + titleSpace : 0;
    const realHeight = height + titleBlock;
    //const widthInMm = width / 96 * 25.4;

    let frameWidthInMm, frameHeightInMm;
    [frameWidthInMm, frameHeightInMm] = config.frameDimensions.split('x').map(Number);

    const svg = d3.select('svg#fan')
        .attr('width', `${frameWidthInMm}mm`)
        .attr('height', `${frameHeightInMm}mm`)
        .style('overflow', 'visible')
        .attr('font-family', 'Helvetica Neue,Helvetica');

    const scale = radius / totalWeight;
    const marginScale = config.contexte === 'demo' ? 0.95 : 1.0;

    const defs = svg.append('defs');

    const center = svg.append('g')
        .attr('id', 'content')
        .attr('transform', 'translate(' + (width / 2) * (1 - marginScale) + ',' + ((height / 2) * (1 - marginScale) + titleBlock) + ') scale(' + marginScale + ', ' + marginScale + ')');

    const g = center.append('g')
        .attr('id', 'content1')
        .attr('transform', 'translate(' + (width / 2) + ', ' + radius + ')' + ' scale(' + scale + ', ' + scale + ')');
    // FIXME scale margin != absolute margin

    if (hasTitle) {
        center.append('g')
            .attr('transform', 'translate(' + width / 2 + ', ' + -(titleSize / 2 + titleSpace) + ')' + 'scale(' + titleSize + ', ' + titleSize + ')')
            .append('text')
            .attr('font-size', 0.8)
            .attr('dominant-baseline', 'middle')
            .attr('text-anchor', 'middle')
            .text(config.title);
    }

    // --
    function hslToRgb(h, s, l) {
        var r, g, b;

        if (s == 0) {
            r = g = b = l; // achromatic
        } else {
            var hue2rgb = function hue2rgb(p, q, t) {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            var p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    const colorScheme = config.colors.scheme;
    let dataToColor, coloringFunction;
    let indexMap;
    if (colorScheme.type === 'gradient' || colorScheme.type === 'textual') {
        const set = new Set();
        dataToColor = [];

        function forEach(tree) {
            const result = colorScheme.f(tree);

            if (result != null) {
                if (!set.has(result))
                    dataToColor.push(result);
                set.add(result);
            }
            if (tree.children) {
                tree.children.forEach(c => forEach(c))
            }
        }
        forEach(data);
        const random = seedrandom(42);

        // https://stackoverflow.com/a/6274381/4413709
        function shuffle(a) {
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        }

        if (config.colors.randomSelection) {
            shuffle(dataToColor);
        }

        if (colorScheme.type === 'gradient') {
            const min = Math.min(...dataToColor),
                max = Math.max(...dataToColor);
            const c1 = hexToRgb(config.colors.colorStart),
                c2 = hexToRgb(config.colors.colorEnd);

            function interpolate(v, a, b) {
                return b !== a ? (v - a) / (b - a) : (a + b) / 2.0;
            }
            coloringFunction = function(d) {
                if (d == null || d.length === 0)
                    return individualsDefaultColorRgb;
                const array = [];
                for (let i = 0; i < 3; i++) {
                    array.push(Math.round(interpolate(d, min, max) * (c2[i] - c1[i]) + c1[i]));
                }
                return array;
            };
        } else {
            indexMap = {};
            for (let i = 0; i < dataToColor.length; i++) {
                indexMap[dataToColor[i]] = i;
            }
            coloringFunction = function(d) {
                if (d == null || d.length === 0)
                    return individualsDefaultColorRgb;
                const hue = indexMap[d] / dataToColor.length;
                return hslToRgb(hue, config.colors.saturation, config.colors.value);
            }
        }
    }

    function backgroundColor(d) {
        if (colorScheme.type === 'none') {
            return individualsDefaultColorRgb;
        } else if (colorScheme.type === 'dual') {
            const result = colorScheme.f(d.data);
            if (result != null) {
                return hexToRgb(result ? config.colors.color1 : config.colors.color2);
            } else
                return individualsDefaultColorRgb;
        } else if (colorScheme.type === 'gradient') {
            return coloringFunction(colorScheme.f(d.data));
        } else {
            return coloringFunction(colorScheme.f(d.data));
        }
    }

    /** Boxes **/
    const individualBoxGenerator = d3.arc()
        .startAngle(d => !isFirstLayer(d) ? d.x0 : 0)
        .endAngle(d => !isFirstLayer(d) ? d.x1 : 2 * Math.PI)
        .innerRadius(d => d.y0)
        .outerRadius(d => d.y1);

    const marriageBoxGenerator = d3.arc()
        .startAngle(d => d.x0)
        .endAngle(d => d.x1)
        .innerRadius(d => d.y1)
        .outerRadius(d => d.y1 + weightRadiusMarriage);

    function meanAngle(arr) {
        function sum(a, b) {
            return a + b;
        }
        return Math.atan2(
            arr.map(Math.sin).reduce(sum) / arr.length,
            arr.map(Math.cos).reduce(sum) / arr.length
        );
    }

    const boxes = g.append('g').attr('id', 'boxes');

    function generateAndStyleBoxes(nodeId, filter, boxGenerator) {
        return boxes.append('g') // Ajoutez les nouveaux groupes au groupe 'boxes'
            .attr('id', nodeId)
            .selectAll('path')
            .data(rootNode.descendants())
            .enter()
            .filter(filter)
            .append('path')
            .attr('d', boxGenerator)
            .attr('stroke', '#32273B')
            .attr('style', '-inkscape-stroke:hairline')
            .attr('stroke-width', '0.01')
            .attr('fill', 'none');
    }

    // Individual boxes
    generateAndStyleBoxes('individual-boxes', _ => true, individualBoxGenerator);

    // Marriage boxes
    if (showMarriages) {
        generateAndStyleBoxes('marriage-boxes', d => d.children, marriageBoxGenerator);
    }


    /** Text paths **/
    function pathId(sosa, line) {
        return "s" + sosa + "l" + line;
    }

    function simpleLine(x0, y0, x1, y1) {
        const generator = d3.line();
        return generator([
            [x0, y0],
            [x1, y1]
        ]);
    }
    
    function fixArc(arcGenerator) {
        return d => arcGenerator(d).split('A').slice(0, 2).join("A"); // Small hack to create a pure arc path (not filled)
    }

    // First node
    //const weightFirstLineSpacing = weightFontFirst 
    const weightFirstLineSpacing = weightFontFirst + 0.05; //FB
    const linesFirst = 4;
    const halfHeightFirst = (linesFirst - 1) * weightFirstLineSpacing / 2;
    for (let i = 0; i < linesFirst; i++) {
        const y = i * weightFirstLineSpacing - halfHeightFirst,
            yabs = Math.abs(y) + weightFirstLineSpacing / 2,
            x = Math.sqrt(Math.max(weightRadiusFirst * weightRadiusFirst - yabs * yabs, 0));
        defs.append('path')
            .attr('id', pathId(1, i))
            .attr('d', simpleLine(-2 * x, y, 2 * x, y));
    }

    // Secondary nodes
    const weightSecondLineSpacing = weightFontOther + 0.03;
    const linesSecond = 3; //FB  Center 3 lines in box (instead of 4)
    const halfHeightSecond = (linesSecond - 1) * weightSecondLineSpacing / 2;
    for (let i = 0; i < linesSecond; i++) {
        const invert = config.invertTextArc ? d => {
            const angle = meanAngle([d.x0, d.x1]);
            return angle < -Math.PI / 2 || angle > Math.PI / 2
        } : _ => false;
        const y = d => (invert(d) ? i : (linesSecond - 1 - i)) * weightSecondLineSpacing - halfHeightSecond;
        const radiusF = d => (d.y0 + d.y1) / 2 + y(d);
        const marginAngleF = d => weightTextMargin / radiusF(d) * (d.depth === 1 ? 1.5 : 1); // FIXME
        const minA = d => Math.min(d.x0, d.x1),
            maxA = d => Math.max(d.x0, d.x1),
            rangeA = d => Math.abs(d.x0 - d.x1) - 2 * marginAngleF(d);
        const start = d => minA(d) + -0.5 * rangeA(d) + marginAngleF(d),
            end = d => maxA(d) + 0.5 * rangeA(d) - marginAngleF(d);
        const arcGenerator = fixArc(d3.arc()
            .startAngle(d => invert(d) ? end(d) : start(d))
            .endAngle(d => invert(d) ? start(d) : end(d))
            .innerRadius(radiusF)
            .outerRadius(radiusF));
        rootNode.descendants().filter(isSecondLayer).forEach(d => {
            defs.append('path')
                .attr('id', pathId(d.data.sosa, i))
                .attr('d', arcGenerator(d))
        });
    }

    function generateThirdLevelTextPaths(lines, spacing, filter) {
        for (let i = 0; i < lines; i++) {
            rootNode.descendants().filter(filter).forEach(d => {
                const angleSplitting = 1.35 / (1 << d.depth); //impact line spacing
                const weightThirdLineSpacing = angleSplitting * spacing;
                const halfHeightThird = (lines - 1) * weightThirdLineSpacing / 2;
                const angleMid = (((meanAngle([d.x0, d.x1]) - Math.PI / 2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                const inverted = fixOrientations && angleMid >= Math.PI / 2 && angleMid < 3 * Math.PI / 2;
                const trueI = inverted ? lines - 1 - i : i;
                const angle = trueI * weightThirdLineSpacing - halfHeightThird;
                const x = Math.cos(angle + angleMid),
                    y = Math.sin(angle + angleMid);
                const halfRange = (d.y1 - d.y0) / 2 - weightTextMargin;
                const y0 = inverted ? (d.y1 - weightTextMargin + halfRange) : (d.y0 + weightTextMargin - halfRange),
                    y1 = inverted ? (d.y0 + weightTextMargin - halfRange) : (d.y1 - weightTextMargin + halfRange);
                defs.append('path')
                    .attr('id', pathId(d.data.sosa, i))
                    .attr('d', simpleLine(x * y0, y * y0, x * y1, y * y1))
            });
        }
    }

    function generateTextPaths(linesIfAngleGreaterThan6, linesIfAngleLessThanOrEqual6, spacing, filter) {
        const lines = config.angle > 6 ? linesIfAngleGreaterThan6 : linesIfAngleLessThanOrEqual6;
        generateThirdLevelTextPaths(lines, spacing, filter);
    }
    
    // Third nodes 
    generateThirdLevelTextPaths(4, Math.PI / 5, isThirdLayer);
    
    // Fourth nodes (3 or 4 lines depending on fanAngle value)
    generateTextPaths(4, 3, Math.PI / 3.5, isFourthLayer);
    
    // Fifth nodes (2 or 3 lines depending on fanAngle value)
    generateTextPaths(3, 2, Math.PI / 2.5, isFifthLayer);
    
    // Sixth nodes (1 or 2 lines depending on fanAngle value)
    generateTextPaths(2, 1, Math.PI / 1.5, isSixthLayer);
    
    // Seventh nodes
    generateThirdLevelTextPaths(1, 0, d => d.depth >= seventhLayer);

    // Modification des chemins de texte pour les nœuds mariage
    if (showMarriages) {
        rootNode.descendants().filter(d => d.children).forEach(d => {
            const angle = meanAngle([d.x0, d.x1]);
            let isTextInverted = (angle < -Math.PI / 2 || angle > Math.PI / 2);

            // Ajoutez la vérification pour config.invertTextArc ici
            if (!config.invertTextArc) {
                isTextInverted = false; // Ne pas inverser le texte si config.invertTextArc est faux
            }

            const isParentArc = isFirstLayer(d); // Vérifie si c'est le noeud des parents du rootNode
            const r = d.y1 + weightRadiusMarriage / 2 * 0.96; // Centrage vertical du texte dans l'arc de mariage
            const marginAngle = d.depth < sixthLevel ? weightTextMargin / r : weightTextMargin / (4 * r);
            const min = Math.min(d.x0, d.x1),
                max = Math.max(d.x0, d.x1),
                range = Math.abs(d.x0 - d.x1) - 2 * marginAngle;

            // Assurez-vous que l'arc pour les parents est toujours au sommet
            const startAngle = isParentArc ? -Math.PI / 2 : (isTextInverted ? max + 0.5 * range - marginAngle : min - 0.5 * range + marginAngle);
            const endAngle = isParentArc ? Math.PI / 2 : (isTextInverted ? min - 0.5 * range + marginAngle : max + 0.5 * range - marginAngle);

            // Utilisez startAngle et endAngle pour dessiner l'arc de mariage
            const marriageArcGenerator = fixArc(d3.arc()
                .startAngle(startAngle)
                .endAngle(endAngle)
                .innerRadius(r)
                .outerRadius(r));

            defs.append('path')
                .attr('id', pathId(d.data.sosa, 'm'))
                .attr('fill', 'none')
                .attr('d', marriageArcGenerator(d));
        });
        
        let timeoutId = null; // Variable pour stocker l'identifiant du timeout

        $('#collapseToolbar').mouseleave(function() {
            // Annuler un timeout précédent s'il existe
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            // Définir un nouveau timeout
            timeoutId = setTimeout(function() {
                // Replier l'accordéon après 1500 ms
                $('#collapseToolbar').collapse('hide');
            }, 1500);
        });
    }

    /** Texts **/
    const texts = g.append('g')
        .attr('id', 'texts');

    //Optimized version of generateTexts. Including text overflow check.
    const checkOverflow = (textElem, totalLength) => textElem.getComputedTextLength() > totalLength;

    const handleOverflow = (textPath, initialSize, step, checkOverflow) => {
        let lower = step, upper = initialSize, mid, doesOverflow;
        while (upper - lower > step) {
            mid = (lower + upper) / 2;
            textPath.style('font-size', `${mid}px`);
            doesOverflow = checkOverflow();
            if (doesOverflow) upper = mid;
            else lower = mid;
        }
        return { finalSize: lower, overflowed: doesOverflow };
    };

    //Separate Text Creation: Create a function to handle the setup of text elements, including setting attributes like font size, font weight, and fill.
    const createTextElement = (anchor, line, alignment, special) => anchor.append('text')
        .attr('dominant-baseline', 'middle')
        .attr('alignment-baseline', 'middle')
        .append('textPath')
        .attr('font-size', `${line.size}px`)
        .attr('font-weight', line.bold ? "bold" : "")
        .attr('fill', d => determineTextColor(d, special))
        .attr('text-anchor', alignment)
        .attr('startOffset', '50%')
        .attr('href', d => `#${pathId(d.data.sosa, special ? 'm' : line.index)}`);

    const determineTextColor = (d, special) => {
        const rgb = backgroundColor(d);
        return ((rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) > 186 || special || !config.colors.textContrast) ? 'black' : 'white';
    };

    // Handle Text Content: Extract the logic for determining the text content into a separate function.
    const setTextContent = (textPath, line, d, special) => {
        const display = config.contemporary.generations <= (d.depth + (special ? 1 : 0)) || (line.bold ? config.contemporary.showNames : config.contemporary.showEvents);
        textPath.text(display ? line.text(d) : '');
    };

    // Optimize Text Size: Separate the logic for handling overflow and adjusting text size.
    const optimizeTextSize = (textPath, textElem, pathElem, line, d) => {
        let size = parseFloat(textPath.style('font-size'));
        const step = 0.01 * size;
        const totalLength = pathElem.getTotalLength() / 2;
        let result = handleOverflow(textPath, size, step, () => checkOverflow(textElem, totalLength));
        
        if (shouldAdjustTextSize(result, line)) {
            adjustText(textPath, textElem, d, result, step, totalLength);
        }
    };
    
    
    function shouldAdjustTextSize(result, line) {
        return (line.filter === isFifthLayer || line.filter === isSixthLayer || line.filter === isSeventhLayer) 
               && line.text === nameInline 
               && result.finalSize < weightFontMin;
    }
    
    function adjustText(textPath, textElem, d, result, step, totalLength) {
        textPath.text(nameFirst(d).charAt(0) + '. ' + nameSecond(d));
        textPath.style('font-size', `${weightFontOther}px`);
        let newResult = handleOverflow(textPath, weightFontOther, step, () => checkOverflow(textElem, totalLength));
        if (newResult.overflowed) {
            textPath.style('font-size', `${newResult.finalSize}px`);
        }
    }
  
    // Optimized version of generateTexts. 
    const generateTexts = (filter, lines, alignment, special) => {
        const anchor = texts.selectAll('path')
            .data(rootNode.descendants())
            .enter()
            .filter(filter);
        
        lines.forEach((line, i) => {
            line.index = i;
            line.filter = filter;
            const textPath = createTextElement(anchor, line, alignment, special);
            textPath.each(function(d) {
                const textElem = this.parentNode;
                const pathHref = d3.select(this).attr('href');
                const pathElem = document.querySelector(pathHref);
    
                if (!pathElem) {
                    console.error(`Path element not found: ${pathHref}`);
                    return;
                }
    
                setTextContent(d3.select(this), line, d, special);
                optimizeTextSize(d3.select(this), textElem, pathElem, line, d);
            });
        });
    };

    // Utility function for extracting first part of the place
    const cleanPlace = place => place.split(/,|\(.*|\s\d+/)[0] || '';

    // Optimized textBirth and textDeath
    const textEvent = (event, showPlaces) => {
        const { date: { display: dateDisplay = '' } = {}, place: { display: placeDisplay = '' } = {} } = event || {};
        const place = showPlaces ? ` ${cleanPlace(placeDisplay)}` : '';
        return dateDisplay ? `${dateDisplay}${place}` : '';
    };

    const textBirth = d => textEvent(d.data.birth, config.places.showPlaces);
    const textDeath = d => textEvent(d.data.death, config.places.showPlaces);

    // Optimized textRange
    const textRange = d => {
        const birthDate = d.data.birth.date?.display;
        const deathDate = d.data.death.date?.display;
        return birthDate && deathDate ? `${birthDate} - ${deathDate}` : birthDate || '';
    };

    // Optimized givenName, nameInline, nameFirst, nameSecond
    const givenName = d => config.showFirstNameOnly ? d.data.name.split(/\s+/)[0] : d.data.name;
    const nameInline = d => `${nameFirst(d)} ${nameSecond(d)}`;
    const nameFirst = d => config.givenThenFamilyName ? givenName(d) : d.data.surname;
    const nameSecond = d => config.givenThenFamilyName ? d.data.surname : givenName(d);
    
    const generations = [
        { condition: isFirstLayer, texts: [{ text: nameFirst, size: weightFontFirst, bold: true }, { text: nameSecond, size: weightFontFirst, bold: true }, { text: textBirth, size: weightFontOther }, { text: textDeath, size: weightFontOther }] },
        { condition: isSecondLayer, texts: [{ text: nameInline, size: weightFontOther, bold: true }, { text: textBirth, size: weightFontDate }, { text: textDeath, size: weightFontDate }] },
        { condition: isThirdLayer, texts: [{ text: nameFirst, size: weightFontOther, bold: true }, { text: nameSecond, size: weightFontOther, bold: true }, { text: textBirth, size: weightFontDate }, { text: textDeath, size: weightFontDate }] },
        { condition: isFourthLayer, texts: config.angle > 6 ? [{ text: nameFirst, size: weightFontOther, bold: true }, { text: nameSecond, size: weightFontOther, bold: true }, { text: textBirth, size: weightFontDate }, { text: textDeath, size: weightFontDate }] : [{ text: nameFirst, size: weightFontOther, bold: true }, { text: nameSecond, size: weightFontOther, bold: true }, { text: textRange, size: weightFontDate }] },
        { condition: isFifthLayer, texts: config.angle > 6 ? [{ text: nameInline, size: weightFontOther, bold: true }, { text: textBirth, size: weightFontDate }, { text: textDeath, size: weightFontDate }] : [{ text: nameInline, size: weightFontOther, bold: true }, { text: textRange, size: weightFontDate }] },
        { condition: isSixthLayer, texts: config.angle > 6 ? [{ text: nameInline, size: weightFontOther, bold: true }, { text: textRange, size: weightFontDate }] : [{ text: nameInline, size: weightFontOther, bold: true }] },
        { condition: isSeventhLayer, texts: [{ text: nameInline, size: angleInterpolate * weightFontOther + (1 - angleInterpolate) * weightFontFar, bold: true }] },
        { condition: isEightsLayer, texts: [{ text: nameInline, size: angleInterpolate * weightFontFar + (1 - angleInterpolate) * weightFontFurthest, bold: true }] }
    ];
    
    generations.forEach(generation => {
        if (generation.condition) {
            generateTexts(generation.condition, generation.texts, "middle", false);
        }
    });

    if (showMarriages) {
        const getMarriageText = (d, includePlace) => {
            if (!jQuery.isEmptyObject(d.data.marriage) && d.data.marriage.date && d.data.marriage.date.display) {
                let text = d.data.marriage.date.display;
                if (includePlace && config.places.showPlaces && d.data.marriage.place && d.data.marriage.place.display) {
                    text += ' ' + d.data.marriage.place.display.split(/,| \(| \s\d/)[0];
                }
                return text;
            }
            return '';
        };
    
        // Marriage texts first
        generateTexts(isMarriageFirst, [
            { text: d => getMarriageText(d, true), size: weightFontMarriage },
        ], "middle", true);
    
        // Marriage texts second
        generateTexts(isMarriageSecond, [
            { text: d => getMarriageText(d, false), size: weightFontMarriage },
        ], "middle", true);
    }


    addFrameToSvg(config.frameDimensions);

    return data;
}

//const frameWidthInMm = 331;
//const frameHeightInMm = 287;
    
// Constantes pour la conversion et les marges
const MARGIN = 10;
const LOGO_WIDTH = 188.985;
const LOGO_HEIGHT = 38.831; // Ajouté pour la clarté, même si non utilisé ici
const LOGO_MARGIN_TOP = 10;
const TEXT_MARGIN_X = 10;
const TEXT_MARGIN_Y = 10;
const TEXT_ROTATION = -90;
const FONT_SIZE = '12px';

// Fonction de conversion mm en pixels
function addFrameToSvg(frameDimensions) {
    const [frameWidthInMm, frameHeightInMm] = frameDimensions.split('x').map(Number);
    const frameWidth = mmToPixels(frameWidthInMm);
    const frameHeight = mmToPixels(frameHeightInMm);

    const svg = d3.select('svg#fan');
    svg.append('rect')
        .attr('id', 'frame')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', frameWidth)
        .attr('height', frameHeight)
        .attr('fill', 'none')
        .attr('stroke', 'black')
        .style('stroke', 'hairline'); // Utilisation de .style pour les styles CSS

    const logoSvgContent = `<svg width="188.985" height="38.831" font-family="Helvetica, Arial, serif" xmlns="http://www.w3.org/2000/svg"><g aria-label="Genealogies" style="font-size:40px;line-height:1.25;font-family:Montserrat;-inkscape-font-specification:Montserrat;white-space:pre;shape-inside:url(#rect32540);fill:#32273b;fill-opacity:1;stroke-width:.487243" transform="translate(-89.14 -55.5) scale(.84182)"><path d="M120.649 95.847q-3.2 0-5.92-1.04-2.68-1.08-4.68-3-1.96-1.92-3.08-4.52-1.08-2.6-1.08-5.68 0-3.08 1.08-5.68 1.12-2.6 3.12-4.52 2-1.92 4.68-2.96 2.72-1.08 5.92-1.08 3.2 0 5.84 1 2.68 1 4.56 3.04l-1.84 1.88q-1.76-1.76-3.88-2.52t-4.56-.76q-2.6 0-4.8.88-2.16.84-3.8 2.44-1.6 1.56-2.52 3.68-.88 2.08-.88 4.6 0 2.48.88 4.6.92 2.12 2.52 3.72 1.64 1.56 3.8 2.44 2.2.84 4.76.84 2.4 0 4.52-.72 2.16-.72 3.96-2.44l1.68 2.24q-2 1.76-4.68 2.68-2.68.88-5.6.88zm7.44-3.92v-10.32h2.84v10.68zM147.626 95.807q-3.28 0-5.76-1.36-2.48-1.4-3.88-3.8-1.4-2.44-1.4-5.56 0-3.12 1.32-5.52 1.36-2.4 3.68-3.76 2.36-1.4 5.28-1.4 2.96 0 5.24 1.36 2.32 1.32 3.64 3.76 1.32 2.4 1.32 5.56 0 .2-.04.44v.44h-18.28v-2.12h16.76l-1.12.84q0-2.28-1-4.04-.96-1.8-2.64-2.8-1.68-1-3.88-1-2.16 0-3.88 1-1.72 1-2.68 2.8-.96 1.8-.96 4.12v.44q0 2.4 1.04 4.24 1.08 1.8 2.96 2.84 1.92 1 4.36 1 1.92 0 3.56-.68 1.68-.68 2.88-2.08l1.6 1.84q-1.4 1.68-3.52 2.56-2.08.88-4.6.88zM173.567 74.407q2.56 0 4.48 1 1.96.96 3.04 2.96 1.12 2 1.12 5.04v12.2h-2.84v-11.92q0-3.32-1.68-5-1.64-1.72-4.64-1.72-2.24 0-3.92.92-1.64.88-2.56 2.6-.88 1.68-.88 4.08v11.04h-2.84v-21h2.72v5.76l-.44-1.08q1-2.28 3.2-3.56 2.2-1.32 5.24-1.32zM198.798 95.807q-3.28 0-5.76-1.36-2.48-1.4-3.88-3.8-1.4-2.44-1.4-5.56 0-3.12 1.32-5.52 1.36-2.4 3.68-3.76 2.36-1.4 5.28-1.4 2.96 0 5.24 1.36 2.32 1.32 3.64 3.76 1.32 2.4 1.32 5.56 0 .2-.04.44v.44h-18.28v-2.12h16.76l-1.12.84q0-2.28-1-4.04-.96-1.8-2.64-2.8-1.68-1-3.88-1-2.16 0-3.88 1-1.72 1-2.68 2.8-.96 1.8-.96 4.12v.44q0 2.4 1.04 4.24 1.08 1.8 2.96 2.84 1.92 1 4.36 1 1.92 0 3.56-.68 1.68-.68 2.88-2.08l1.6 1.84q-1.4 1.68-3.52 2.56-2.08.88-4.6.88zM226.554 95.607v-4.64l-.12-.76v-7.76q0-2.68-1.52-4.12-1.48-1.44-4.44-1.44-2.04 0-3.88.68-1.84.68-3.12 1.8l-1.28-2.12q1.6-1.36 3.84-2.08 2.24-.76 4.72-.76 4.08 0 6.28 2.04 2.24 2 2.24 6.12v13.04zm-7.24.2q-2.36 0-4.12-.76-1.72-.8-2.64-2.16-.92-1.4-.92-3.2 0-1.64.76-2.96.8-1.36 2.56-2.16 1.8-.84 4.8-.84h7.24v2.12h-7.16q-3.04 0-4.24 1.08-1.16 1.08-1.16 2.68 0 1.8 1.4 2.88 1.4 1.08 3.92 1.08 2.4 0 4.12-1.08 1.76-1.12 2.56-3.2l.64 1.96q-.8 2.08-2.8 3.32-1.96 1.24-4.96 1.24zM236.987 95.607v-29.68h2.84v29.68zM256.329 95.807q-3.04 0-5.48-1.36-2.4-1.4-3.8-3.8-1.4-2.44-1.4-5.56 0-3.16 1.4-5.56 1.4-2.4 3.8-3.76 2.4-1.36 5.48-1.36 3.12 0 5.52 1.36 2.44 1.36 3.8 3.76 1.4 2.4 1.4 5.56 0 3.12-1.4 5.56-1.36 2.4-3.8 3.8-2.44 1.36-5.52 1.36zm0-2.52q2.28 0 4.04-1 1.76-1.04 2.76-2.88 1.04-1.88 1.04-4.32 0-2.48-1.04-4.32-1-1.84-2.76-2.84-1.76-1.04-4-1.04t-4 1.04q-1.76 1-2.8 2.84-1.04 1.84-1.04 4.32 0 2.44 1.04 4.32 1.04 1.84 2.8 2.88 1.76 1 3.96 1zM281.807 103.567q-2.88 0-5.52-.84-2.64-.84-4.28-2.4l1.44-2.16q1.48 1.32 3.64 2.08 2.2.8 4.64.8 4 0 5.88-1.88 1.88-1.84 1.88-5.76v-5.24l.4-3.6-.28-3.6v-6.36h2.72v18.44q0 5.44-2.68 7.96-2.64 2.56-7.84 2.56zm-.52-8.76q-3 0-5.4-1.28-2.4-1.32-3.8-3.64-1.36-2.32-1.36-5.32 0-3 1.36-5.28 1.4-2.32 3.8-3.6 2.4-1.28 5.4-1.28 2.8 0 5.04 1.16t3.56 3.44q1.32 2.28 1.32 5.56t-1.32 5.56q-1.32 2.28-3.56 3.48-2.24 1.2-5.04 1.2zm.28-2.52q2.32 0 4.12-.96 1.8-1 2.84-2.72 1.04-1.76 1.04-4.04 0-2.28-1.04-4-1.04-1.72-2.84-2.68-1.8-1-4.12-1-2.28 0-4.12 1-1.8.96-2.84 2.68-1 1.72-1 4 0 2.28 1 4.04 1.04 1.72 2.84 2.72 1.84.96 4.12.96z" style="fill:#32273b;fill-opacity:1;stroke-width:.487243"/><path d="M301.729 81.328q1.599 0 2.689 1.123 1.09 1.122 1.09 2.694 0 1.572-1.09 2.62-1.09 1.122-2.69 1.122-1.598 0-2.689-1.048-1.09-1.048-1.09-2.62 0-1.646 1.09-2.768 1.018-1.123 2.69-1.123z" style="fill:#fff;fill-opacity:1;stroke:#32273b;stroke-width:.276232;stroke-miterlimit:4;stroke-dasharray:none;stroke-opacity:1"/><path d="M303.149 91.055v21h-2.84v-21zM320.944 95.807q-3.28 0-5.76-1.36-2.48-1.4-3.88-3.8-1.4-2.44-1.4-5.56 0-3.12 1.32-5.52 1.36-2.4 3.68-3.76 2.36-1.4 5.28-1.4 2.96 0 5.24 1.36 2.32 1.32 3.64 3.76 1.32 2.4 1.32 5.56 0 .2-.04.44v.44h-18.28v-2.12h16.76l-1.12.84q0-2.28-1-4.04-.96-1.8-2.64-2.8-1.68-1-3.88-1-2.16 0-3.88 1-1.72 1-2.68 2.8-.96 1.8-.96 4.12v.44q0 2.4 1.04 4.24 1.08 1.8 2.96 2.84 1.92 1 4.36 1 1.92 0 3.56-.68 1.68-.68 2.88-2.08l1.6 1.84q-1.4 1.68-3.52 2.56-2.08.88-4.6.88z" style="fill:#32273b;fill-opacity:1;stroke-width:.487243"/></g></svg>`; // Insérer le code SVG complet ici

    const logoXPosition = frameWidth - LOGO_WIDTH - MARGIN;
    svg.append('g')
        .html(logoSvgContent)
        .attr('id', 'logo')
        .attr('transform', `translate(${logoXPosition}, ${LOGO_MARGIN_TOP})`);

    svg.append('text')
        .attr('id', 'info')
        .attr('x', TEXT_MARGIN_X)
        .attr('y', frameHeight - TEXT_MARGIN_Y)
        .attr('font-size', FONT_SIZE)
        .text(`Visitez le site genealog.ie pour commander cet éventail généalogique gravé sur bois ou sur métal. Dimensions réelles avec le cadre : ${frameWidthInMm}x${frameHeightInMm} (mm). Contact : contact@genealog.ie`)
        .attr('transform', `rotate(${TEXT_ROTATION}, ${TEXT_MARGIN_X}, ${frameHeight - TEXT_MARGIN_Y})`);

    const content = svg.select('#content');
    const {width: contentWidth, height: contentHeight} = content.node().getBBox();
    const contentX = (frameWidth - contentWidth) / 2;
    const contentY = (frameHeight - contentHeight) / 2;
    content.attr('transform', `translate(${contentX}, ${contentY})`);
}

export { drawFan as draw };