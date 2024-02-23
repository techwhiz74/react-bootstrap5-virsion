import { padTwoDigits } from './utils.js';

const parseGedcom = require('parse-gedcom');

const EMPTY = "";
const TAG_HEAD = "HEAD",
    TAG_ENCODING = "CHAR",
    TAG_FORMAT = "FORM",
    TAG_INDIVIDUAL = "INDI",
    TAG_FAMILY = "FAM",
    TAG_CHILD = "CHIL",
    TAG_HUSBAND = "HUSB",
    TAG_WIFE = "WIFE",
    TAG_NAME = "NAME",
    TAG_GIVEN_NAME = "GIVN",
    TAG_SURNAME = "SURN",
    TAG_SURNAME_PREFIX = "SPFX",
    TAG_BIRTH = "BIRT",
    TAG_BAPTISM = "CHR",
    TAG_DEATH = "DEAT",
    TAG_BURIAL = "BURI",
    TAG_SEX = "SEX",
    TAG_DATE = "DATE",
    TAG_PLACE = "PLAC",
    TAG_MARRIAGE = "MARR",
    TAG_SIGNATURE = "SIGN",
    TAG_EVENT = "EVEN",
    TAG_TYPE = "TYPE",
    TAG_NOTE = "NOTE",
    TAG_OCCUPATION = "OCCU";
const TAG_YES = "YES",
    TAG_ANSI = "ANSI";
const TAG_ABOUT = 'ABT',
    TAG_BEFORE = 'BEF',
    TAG_AFTER = 'AFT';
const TAG_GREGORIAN = '@#DGREGORIAN@',
    TAG_REPUBLICAN = '@#DFRENCH R@';
const TAGS_MONTH = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const TAGS_MONTH_REPUBLICAN = ['VEND', 'BRUM', 'FRIM', 'NIVO', 'PLUV', 'VENT', 'GERM', 'FLOR', 'PRAI', 'MESS', 'THER', 'FRUC', 'COMP'];

const VALUE_OCCUPATION = "Occupation";

const republicanConversion = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'];


function byTag(tag) {
    return obj => obj.tag === tag;
}

function byData(data) {
    return obj => obj.data === data;
}

function byChild(child) {
    return fam => fam.tree.filter(byTag(TAG_CHILD)).filter(byData(child.pointer)).length > 0;
}

function getFirst(array, def) {
    if (array.length > 0)
        return array[0];
    else
        return def;
}

function formatTown(str) {
    if (typeof str !== 'string') {
        str = String(str);
    }
    // Capitalizing the first letter of each word after a space or a hyphen
    str = str.replace(/(?:^|\s|-)(\S)/g, function (match) {
        return match.toUpperCase();
    });
    
    // Remplacer les différentes occurrences spécifiques
    const replacements = [
        { pattern: /-Sur-| Sur /g, replacement: '-s/-' },
        { pattern: /-S\/-| S\/ /g, replacement: '-s/-' },
        { pattern: /-Sous-| Sous /g, replacement: '-/s-' },
        { pattern: /-\/S-| \/S /g, replacement: '-/s-' },
        { pattern: /-La-| La /g, replacement: '-la-' },
        { pattern: /-Le-| Le /g, replacement: '-le-' },
        { pattern: /-Les-| Les /g, replacement: '-les-' },
        { pattern: /-Lès-| De /g, replacement: '-lès-' },
        { pattern: /-Du-| Du /g, replacement: '-du-' },
        { pattern: /-De-| De /g, replacement: '-de-' },
        { pattern: /-Des-| Des /g, replacement: '-des-' },
        { pattern: /-Devant-| Devant /g, replacement: '-devant-' },
        { pattern: /-En-| En /g, replacement: '-en-' },
        { pattern: /-Et-| Et /g, replacement: '-et-' },
        { pattern: /(Saint|Sainte)-|(Saint|Sainte) /g, replacement: function(match) { return match[0] === 'S' ? 'St-' : 'Ste-'; } },
        { pattern: /-(Saint|Sainte)-| (Saint|Sainte) /g, replacement: function(match) { return match.includes('Sainte') ? '-Ste-' : '-St-'; } },
        { pattern: /Mont-|Mont /g, replacement: 'Mt-' },
        { pattern: /-Mont$/g, replacement: '-Mt' },
        { pattern: /-Madame$/g, replacement: '-Mme' },
        { pattern: /-Vieux$/g, replacement: '-Vx' },
        { pattern: /-Vieux-/g, replacement: '-Vx-' },
        { pattern: /-Grand$/g, replacement: '-Gd' },
        { pattern: /-Petit$/g, replacement: '-Pt' },
        { pattern: /-Moulineaux$/g, replacement: '-Mlx' },
        { pattern: /(Paris|Marseille|Lyon)(-|\s)\b(X{0,3}(I{1,3}|IV|VI{0,3}|IX|X{0,3}V?I{0,3})\b)(ème)?/gi, replacement: '$1' },
        { pattern: /(Paris|Marseille|Lyon)(-|\s)\d{5}/gi, replacement: '$1' },
        { pattern: /(Paris|Marseille|Lyon)(-|\s)?(\d{1,2}(er|e|ème)?)/gi, replacement: '$1' },
    ];
    replacements.forEach(({ pattern, replacement }) => {
        str = str.replace(pattern, replacement);
    });
    return str;
}

function formatSurname(surname) {
    // Remplace "xxx ou yyy" par "xxx" (exemple initial)
    surname = surname.replace(/(\S+)\s+ou\s+\S+/gi, '$1');

    // Ajoutez ici d'autres règles de remplacement au besoin
    // Par exemple:
    // surname = surname.replace(/un_autre_motif/g, 'remplacement');

    return surname;
}

// Optimized version of buildIndividual
function buildIndividual(json, config) {
    if (json == null) {
        const dummyEvent = {};
        return { id: null, name: '', surname: '', birth: dummyEvent, death: dummyEvent };
    }

    const names = json.tree.filter(byTag(TAG_NAME));
    const extractData = (tag) => names.flatMap(a => a.tree.filter(byTag(tag)).map(o => o.data));
    let name = getFirst(extractData(TAG_GIVEN_NAME), EMPTY).replace(/_/, ' '),
        surname = getFirst(extractData(TAG_SURNAME), EMPTY).replace(/_/, ' ');
    const surnamePrefix = getFirst(extractData(TAG_SURNAME_PREFIX), EMPTY);

    // Appliquez la fonction de manipulation sur surname
    surname = formatSurname(surname);

    const extractFirstByTag = (tag, value) => getFirst(json.tree.filter(byTag(tag)).map(s => s.data === value), null);
    const sex = extractFirstByTag(TAG_SEX, 'M');
    const canSign = extractFirstByTag(TAG_SIGNATURE, TAG_YES);

    const occupations = json.tree.filter(byTag(TAG_OCCUPATION)).map(d => d.data);
    const occupationsOld = json.tree.filter(byTag(TAG_EVENT)).map(e => e.tree).filter(e => e.filter(byTag(TAG_TYPE))
        .some(e => e.data === VALUE_OCCUPATION)).flatMap(e => e.filter(byTag(TAG_NOTE)).map(n => n.data));

    const firstOccupation = getFirst(occupations.concat(occupationsOld), null);

    if (!name || !surname) { // Use NAME instead (compatibility with old software)
        names.map(o => {
            const split = o.data.split('/').map(s => s.trim().replace(/_/, ' '));
            if (!name)
                name = split[0];
            if (split.length > 1 && !surname)
                surname = split[1];
        })
    }

    if (surnamePrefix) { // Surname prefix
        surname = surnamePrefix.split(',').map(s => s.trim()).join(' ') + ' ' + surname;
    }

    let birthTags = [TAG_BIRTH],
        deathTags = [TAG_DEATH];
    const birthTagsExt = [TAG_BAPTISM],
        deathTagsExt = [TAG_BURIAL];

    if (config.substituteEvents) {
        birthTags = birthTags.concat(birthTagsExt);
        deathTags = deathTags.concat(deathTagsExt);
    }

    function buildEventFallback(tags) {
        let first = null;
        for (let i = 0; i < tags.length; i++) {
            const tag = tags[i];
            first = getFirst(json.tree.filter(byTag(tag)), null);
            if (first !== null) {
                break;
            }
        }
        return buildEvent(first, config);
    }

    const birthData = buildEventFallback(birthTags),
        deathData = buildEventFallback(deathTags);

    return { id: json.pointer, name: name, surname: surname, birth: birthData, death: deathData, sex: sex, canSign: canSign, occupation: firstOccupation };
}

// optimized version of processDate
function processDate(s, { dates: { showInvalidDates, showYearsOnly } = {} } = {}) {
    let trimed = s.trim();
    const isRepublican = trimed.startsWith(TAG_REPUBLICAN);
    if (isRepublican || trimed.startsWith(TAG_GREGORIAN)) {
        trimed = trimed.substring(isRepublican ? TAG_REPUBLICAN.length : TAG_GREGORIAN.length);
    }
    let split = trimed.trim().split(/\s+/);
    const objDef = { display: showInvalidDates ? s : EMPTY };
    if (split.length === 0) return objDef;

    const replacement = { [TAG_ABOUT]: '~', [TAG_BEFORE]: '<', [TAG_AFTER]: '>' };
    let isYearLegit = true;
    let prefix = '';
    if (replacement[split[0]]) {
        if (split.length === 1) return objDef;
        isYearLegit = split[0] === TAG_ABOUT;
        prefix += replacement[split[0]];
        split = split.slice(1);
    }

    if (split.length > 3) return objDef;
    const year = parseInt(split[split.length - 1], 10);
    if (split[split.length - 1] !== year + '') return objDef;

    let obj = {};
    if (isYearLegit) {
        const republicanCalendarStart = 1792;
        obj.year = isRepublican ? year + republicanCalendarStart : year;
    }
    const yearDisplay = isRepublican ? republicanConversion[year - 1] : year + '';
    if (split.length === 1) {
        obj.display = `${prefix}${yearDisplay}`;
        return obj;
    }

    const month = (isRepublican ? TAGS_MONTH_REPUBLICAN : TAGS_MONTH).indexOf(split[split.length - 2]) + 1;
    if (month === 0) return objDef;

    let day = 0;
    if (split.length === 3) {
        day = split[0];
        const date = new Date(year, month - 1, day);
        const isValidDate = (Boolean(+date) && date.getDate() == day) || isRepublican; // Assume correct if republican, for now
        if (!isValidDate) return objDef;
    }

    const sep = '/';
    obj.display = showYearsOnly ? `${prefix}${yearDisplay}` :
        day === 0 ? `${padTwoDigits(month)}${sep}${yearDisplay}` :
            `${padTwoDigits(day)}${sep}${padTwoDigits(month)}${sep}${yearDisplay}`;

    return obj.display ? obj : EMPTY;
}

// optimized version of processPlace
function processPlace({ data: original } = {}, { places: { hasSpecialFormat, townIndex, departementIndex, countryIndex, subdivisionIndex, showPlaces } = {} } = {}) {
    const obj = {};
    const split = original.split(/\s*,\s*/);
    const hasSpecialFormatModern = hasSpecialFormat || [5, 6].includes(split.length) && (!split[1] || parseInt(split[1]) + '' === split[1]);
    const indicesWithinBounds = Math.max(townIndex, departementIndex, countryIndex) < split.length;

    if (split.length === 1) {
        obj.town = formatTown(split[0]);
    } else if (hasSpecialFormatModern && indicesWithinBounds) {
        if (subdivisionIndex < split.length) // Special case
            obj.subdivision = split[subdivisionIndex];
        obj.town = formatTown(split[townIndex]); // Format town name
        obj.departement = split[departementIndex];
        obj.country = split[countryIndex];
    } else if (split.length >= 3) {
        obj.subdivision = split.length > 3 ? split.slice(0, split.length - 3).map(s => s.trim()).join(', ') : undefined;
        obj.town = formatTown(split[split.length - 3]); // Format town name
        obj.departement = split[split.length - 2];
        obj.country = split[split.length - 1];
    }

    const reduced = obj.subdivision ? `${obj.subdivision}, ${obj.town}` : obj.town || original;
    obj.display = showPlaces ? reduced : '';

    return obj;
}

function buildEvent(event, config) {
    if (event == null) {
        return {};
    }

    const date = getFirst(event.tree.filter(byTag(TAG_DATE)).map(o => o.data).map(s => processDate(s, config)), EMPTY);

    const place = getFirst(event.tree.filter(byTag(TAG_PLACE)).map(o => processPlace(o, config)), EMPTY);

    return { date: date, place: place};
}


function buildHierarchy(json, config) {
    json = json || [];
    const individuals = json.filter(byTag(TAG_INDIVIDUAL)),
        families = json.filter(byTag(TAG_FAMILY));

    const placeFormatArray = json.filter(byTag(TAG_HEAD)).flatMap(o => o.tree).filter(byTag(TAG_PLACE)).flatMap(o => o.tree).filter(byTag(TAG_FORMAT));
    let hasSpecialPlaceFormat = placeFormatArray.length > 0;

    // Defaults
    config.places.subdivisionIndex = 5;
    config.places.townIndex = 0;
    config.places.departementIndex = 2;
    config.places.countryIndex = 4;

    // Optimized code
    if (hasSpecialPlaceFormat) {
        const format = placeFormatArray[0].data.trim().split(/\s*,\s*/);
        const placeTypes = ["Subdivision", "Town", "County", "Country"];
        const placeIndices = {};
    
        placeTypes.forEach((placeType, index) => {
            const position = format.indexOf(placeType);
            if (position === -1) {
                hasSpecialPlaceFormat = false;
            } else {
                placeIndices[placeType] = position;
            }
        });
    
        if (hasSpecialPlaceFormat) {
            config.places.subdivisionIndex = placeIndices["Subdivision"];
            config.places.townIndex = placeIndices["Town"];
            config.places.departementIndex = placeIndices["County"];
            config.places.countryIndex = placeIndices["Country"];
        }
    }

    config.places.hasSpecialFormat = hasSpecialPlaceFormat;

    if (individuals.length === 0)
        return null;

    const rootIndividual = individuals.filter(i => i.pointer === config.root)[0];

    const maxHeight = config.maxGenerations - 1;

    function buildRecursive(individual, parent, sosa, height) {

        // TODO: `individual` can be null thus raising an excepting on `individual.pointer`

        let obj = buildIndividual(individual, config);
        obj.sosa = sosa;
        obj.generation = height;
        if (individual == null) { // Special case: placeholder individuals
            obj.sex = sosa % 2 === 0;
        }

        if (config.computeChildrenCount) { // On-demand property
            const forTag = obj.sex == null ? null : (obj.sex ? TAG_HUSBAND : TAG_WIFE);
            const familiesAsParent = families.filter(f => f.tree.some(t => t.tag === forTag && individual != null && t.data === individual.pointer)).flatMap(f => f.tree.filter(byTag(TAG_CHILD)));
            obj.childrenCount = individual != null ? familiesAsParent.length : null;
        }

        if (height < maxHeight) {
            const familyA = individual != null ? families.filter(byChild(individual)) : [];

            if (familyA.length === 0 && config.showMissing) {
                obj.children = [buildRecursive(null, obj, sosa * 2, height + 1), buildRecursive(null, obj, sosa * 2 + 1, height + 1)];
                obj.marriage = {};
            } else if (familyA.length > 0) {
                const family = familyA[0];

                function getParent(tag) {
                    const parent = family.tree.filter(byTag(tag)).flatMap(id => individuals.filter(ind => ind.pointer === id.data));
                    return !config.showMissing || parent.length > 0 ? parent : [null];
                }

                const husbandA = getParent(TAG_HUSBAND),
                    wifeA = getParent(TAG_WIFE);

                const parents = (husbandA.map(h => buildRecursive(h, obj, sosa * 2, height + 1)))
                    .concat(wifeA.map(w => buildRecursive(w, obj, sosa * 2 + 1, height + 1)));

                if (parents.length > 0) {
                    obj.children = parents;

                    obj.marriage = buildEvent(getFirst(family.tree.filter(byTag(TAG_MARRIAGE)), null), config);
                }
            }
        }

        obj.parent = _ => parent;

        return obj;
    }

    return buildRecursive(rootIndividual, null, 1, 0);
}


const fs = require('fs');

function toJson(data) {
    const triggers = "[�]"; 
    const view = new Uint8Array(data);
    const text = new TextDecoder().decode(view);
    const parsed = parseGedcom.parse(text);

    const isLikelyAnsi = (new RegExp(triggers)).test(text);
    const isAnsi = getFirst(parsed.filter(byTag(TAG_HEAD)).flatMap(a => a.tree.filter(byTag(TAG_ENCODING)).map(a => a.data)), null) === TAG_ANSI;

    let result;

    if (isLikelyAnsi || isAnsi) { 
        console.log("ANSI detected, converting");
        const extendedAsciiTable = "€?‚ƒ„…†‡ˆ‰Š‹Œ?Ž??‘’“”•–—˜™š›œ?žŸ?¡¢£¤¥¦§¨©ª«¬?®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ";
        const builder = Array.from(view, charCode => (charCode & 0x80) === 0 ? String.fromCharCode(charCode) : extendedAsciiTable.charAt(charCode ^ 0x80));
        const text2 = builder.join('');

        result = parseGedcom.parse(text2);
    } else {
        result = parsed;
    }

    // Création d'un objet Blob à partir du résultat
    const blob = new Blob([JSON.stringify(result, null, 2)], {type: "application/json"});

    // Création d'un lien de téléchargement pour le Blob
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Le code suivant est commenté pour une utilisation ultérieure.
    // Il crée un lien de téléchargement pour le fichier JSON généré.
    // Pour l'utiliser, décommentez simplement les lignes suivantes.
    /*
    link.href = url;
    link.download = 'test.json';
    link.textContent = 'Télécharger le fichier JSON';
    */

    // Ajout du lien au document
    // Ce code est également commenté pour une utilisation ultérieure.
    // Il ajoute le lien de téléchargement au corps du document.
    // Pour l'utiliser, décommentez simplement la ligne suivante.
    //document.body.appendChild(link);

    return result;
}

function getIndividualsList(json) {
    const config = { dates: { showInvalidDates: false, showYearsOnly: true }, places: { showPlaces: false } };
    return json.filter(byTag(TAG_INDIVIDUAL)).map(ind => buildIndividual(ind, config));
}

// http://www.onicos.com/staff/iz/amuse/javascript/expert/utf.txt
function Utf8ArrayToStr(array) {
    let out, i, len, c;
    let char2, char3;

    out = "";
    len = array.length;
    i = 0;
    while (i < len) {
        c = array[i++];
        switch (c >> 4) {
        case 0:
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
            // 0xxxxxxx
            out += String.fromCharCode(c);
            break;
        case 12:
        case 13:
            // 110x xxxx   10xx xxxx
            char2 = array[i++];
            out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
            break;
        case 14:
            // 1110 xxxx  10xx xxxx  10xx xxxx
            char2 = array[i++];
            char3 = array[i++];
            out += String.fromCharCode(((c & 0x0F) << 12) |
                    ((char2 & 0x3F) << 6) |
                    ((char3 & 0x3F) << 0));
            break;
        }
    }
    return out;
}

export {
    buildIndividual,
    toJson,
    buildHierarchy,
    getIndividualsList
};