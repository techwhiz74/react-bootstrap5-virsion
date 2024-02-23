import panzoom from 'panzoom';
import * as d3 from 'd3';
import { toJson, getIndividualsList } from './parse.js';
import { draw } from './fan.js';
import { fanAsXml, generateFileName, generatePdf, downloadContent, downloadPNG, updateFilename } from './downloads.js';
import { setupAllEventListeners, setupParameterEventListeners, setupTooltipAndColorPicker, setupPageInitialization } from './eventListeners.js';

$(document).ready(function() {
    setupAllEventListeners();
    setupParameterEventListeners(onSettingChange);
    setupTooltipAndColorPicker();
    setupPageInitialization();
});

const Fan = require('./fan');

const previewGroup = $('#preview-group');

let contexte; // Demo ou production
let config; 

function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Select picker
const individualSelect = $('#individual-select');
individualSelect.selectpicker({
    noneSelectedText: __('arbreomatic.no_individual_selected')
});

let map = null;
let json = null;

let previousColoring = null;

let previousDimensions = null;

let userData = {};

function updateUIElements() {
    const previewGroup = document.querySelector('#preview-group');
    const individualSelect = document.querySelector('#individual-select');

    previewGroup.style.display = '';
    $(individualSelect).selectpicker('refresh');
}

function onFileChange(data) {
    json = toJson(data);
    
    userData = json;
    localStorage.setItem('userData', JSON.stringify(userData));

    $('.parameter, #individual-select, #download-menu').attr('disabled', false);
    $('.colorpicker-group').each(function() {
        $(this).data('colorpicker').enable()
    });
    $('#print').removeClass('disabled');
    document.getElementById('toolbarLink').style.display = 'block'; // or 'inline'

    let found = false;

    individualSelect.empty();

    const individuals = getIndividualsList(json)
        .map((o, index) => {
            const text = `${o.surname}${o.surname ? ' ' : ''}${o.name}${o.birth.date && (o.birth.date.display || o.death.date && o.death.date.display) ? ` (${o.birth.date && o.birth.date.display ? o.birth.date.display : '?'}${o.death.date && o.death.date.display ? '-' + o.death.date.display : ''})` : ''}`;

            const object = { value: o.id, text };
            // Rosalie Martin is selected by default with demo file
            if (o.name === 'Rosalie' && o.surname === 'Martin') {
                object['selected'] = 'selected';
                found = true;
            }

            return object;
        });

    if (!found && individuals.length > 0) {
        individuals[0]['selected'] = 'selected';
    }

    individuals.sort((a, b) => {
        const nameA = a.text || 'zzz';
        const nameB = b.text || 'zzz';
        return nameA.localeCompare(nameB);
    }).forEach(o => {
        const option = $('<option>', o);
        individualSelect.append(option);
    });
    
    updateUIElements();

    onSettingChange();

    map = panzoom(document.querySelector('#map'));

    let first = true;
    map.on('transform', function(e) {
        if (first) {
            first = false;
        } else {
            $('#tip').addClass('tip-hidden'); // User has already interacted with the preview, hint tooltip is not needed anymore
        }
    });

    resetZoom();

}

function resetZoom() {
    if (map != null) {
        const previewContainer = $('#preview'),
            svg = $('#fan');
        const svgWidth = svg.width(),
            svgHeight = svg.height();

        // Calcul du ratio pour que la hauteur du SVG soit à 90% de la hauteur de l'élément #preview
        const ratio = previewContainer.height() * 0.80 / svgHeight;

        // Calcul de la nouvelle largeur du SVG après application du ratio
        const newSvgWidth = svgWidth * ratio;

        // Calcul pour centrer le SVG dans le conteneur de prévisualisation
        const previewWidth = previewContainer.width();
        const centerX = (previewWidth - newSvgWidth) / 2; // Centrer horizontalement

        // Application du zoom et du déplacement pour centrer le SVG
        map.zoomAbs(0, 0, ratio);
        map.moveTo(centerX, 0);
    }
}

const COLORING_NONE = 'none',
    COLORING_DUAL = 'dual',
    COLORING_GRADIENT = 'gradient',
    COLORING_TEXTUAL = 'textual';

const coloringSchemes = {
    none: { type: COLORING_NONE },
    sex: { type: COLORING_DUAL, f: (d => d.sex), color1: '#e0f4ff', color2: '#ffe0eb' },
    generation: { type: COLORING_GRADIENT, f: (d => d.generation), colorStart: '#FBC79F', colorEnd: '#CEFFCE' },
    agedeath: {
        type: COLORING_GRADIENT,
        f: (d => {
            if (!d.birth || !d.birth.date || !d.birth.date.year)
                return null;
            if (!d.death || !d.death.date || !d.death.date.year)
                return null;
            return d.death.date.year - d.birth.date.year;
        }),
        colorStart: '#F9B4B4',
        colorEnd: '#BAFCFF'
    },
    agemarriage: {
        type: COLORING_GRADIENT,
        f: (d => {
            if (!d.birth || !d.birth.date || !d.birth.date.year)
                return null;
            const parent = d.parent();
            if (parent == null || !parent.marriage || !parent.marriage.date || !parent.marriage.date.year)
                return null;
            return parent.marriage.date.year - d.birth.date.year;
        }),
        colorStart: '#8EF389',
        colorEnd: '#D5B4F9'
    },
    birthdate: { type: COLORING_GRADIENT, f: (d => d.birth && d.birth.date && d.birth.date.year ? d.birth.date.year : null), colorStart: '#565756', colorEnd: '#BAFCFF' },
    birthtown: { type: COLORING_TEXTUAL, f: (d => d.birth && d.birth.place && d.birth.place.town ? d.birth.place.town : null) },
    birthdepartement: { type: COLORING_TEXTUAL, f: (d => d.birth && d.birth.place && d.birth.place.departement ? d.birth.place.departement : null) },
    patronym: { type: COLORING_TEXTUAL, f: (d => d.surname) },
    signature: { type: COLORING_DUAL, f: (d => d.canSign), color1: '#83FBBC', color2: '#C8C8C8' },
    occupation: { type: COLORING_TEXTUAL, f: (d => d.occupation) },
    childrencount: { type: COLORING_GRADIENT, f: (d => d.childrenCount), colorStart: '#BAFCFF', colorEnd: '#F9B4B4' },
};

function colorValue(id) {
    return $(id).parent().data('colorpicker').getValue();
}

let shouldShowInitialMessage = true;
let filename = "";
let rootIndividual; 

// Initialisation des sélections pour les éléments statiques au début du script
const selectDates = document.querySelector('#select-dates');
const selectPlaces = document.querySelector('#select-places');
const selectContemporary = document.querySelector('#select-hidden-generations');
const selectColorScheme = document.querySelector('#select-color-scheme');
const selectNameOrder = document.querySelector('#select-name-order');
const selectNameDisplay = document.querySelector('#select-name-display');
const substituteEvents = document.querySelector('#substitute-events');
const showChronology = document.querySelector('#show-chronology');
const title = document.querySelector('#title');
const titleSize = document.querySelector('#title-size');
const titleMargin = document.querySelector('#title-margin');
const showInvalidDates = document.querySelector('#show-invalid-dates');
const weightGenerations = ['#weightg1', '#weightg2', '#weightg3', '#weightg4'].map(id => document.querySelector(id));
const strokeWeight = document.querySelector('#stroke-weight');
const hiddenGenerationsCount = document.querySelector('#hidden-generations-count');
const textContrast = document.querySelector('#text-contrast');
const saturation = document.querySelector('#saturation');
const value = document.querySelector('#value');
const randomSelection = document.querySelector('#random-selection');
const colorIndividuals = document.querySelector('#color-individuals');
const colorMarriages = document.querySelector('#color-marriages');
const color1 = document.querySelector('#color1');
const color2 = document.querySelector('#color2');
const colorStart = document.querySelector('#color-start');
const colorEnd = document.querySelector('#color-end');
// Initialisation des sélections via UI
let invertTextArc = document.querySelector('#invert-text-arc');
let showMarriages = document.querySelector('#show-marriages');
let showMissing = document.querySelector('#show-missing');
let fanAngle = () => document.querySelector('input[name="fanAngle"]:checked').value;
let maxGenerations = () => document.querySelector('input[name="max-generations"]:checked').value;

function getSelectedValues() {
    return {
        selectedDates: parseInt(selectDates.value, 10),
        selectedPlaces: parseInt(selectPlaces.value, 10),
        selectedContemporary: parseInt(selectContemporary.value, 10),
        coloring: selectColorScheme.value,
        fanAngle: parseInt(fanAngle(), 10),
        maxGenerations: parseInt(maxGenerations(), 10),
        showMarriages: showMarriages.checked,
        showMissing: showMissing.checked,
        givenThenFamilyName: parseInt(selectNameOrder.value, 10) === 0,
        showFirstNameOnly: parseInt(selectNameDisplay.value, 10) === 1,
        substituteEvents: substituteEvents.checked,
        invertTextArc: invertTextArc.checked,
        isTimeVisualisationEnabled: showChronology.checked,
        title: title.value.trim(),
        titleSize: parseInt(titleSize.value, 10) / 100.0,
        titleMargin: parseInt(titleMargin.value, 10) / 100.0,
    };
}

let dimensions = [];
function calculateDimensions(fanAngle, maxGenerations, showMarriages) {
    const dimensionsMap = {
        270: {
            8: {
                true: { fanWidthInMm: "301", frameDimensionsInMm: "331x287" },
                false: { fanWidthInMm: "301", frameDimensionsInMm: "331x287" }
            },
            7: {
                true: { fanWidthInMm: "301", frameDimensionsInMm: "331x287" },
                false: { fanWidthInMm: "245", frameDimensionsInMm: "260x260" }
            }
        },
        360: {
            8: {
                true: { fanWidthInMm: "297", frameDimensionsInMm: "331x331" },
                false: { fanWidthInMm: "297", frameDimensionsInMm: "331x331" }
            },
            7: {
                true: { fanWidthInMm: "297", frameDimensionsInMm: "331x331" },
                false: { fanWidthInMm: "245", frameDimensionsInMm: "260x260" }
            }
        }
    };

    const dimensions = dimensionsMap[fanAngle][maxGenerations][showMarriages];
    return {
        fanWidthInMm: dimensions ? dimensions.fanWidthInMm : undefined,
        frameDimensionsInMm: dimensions ? dimensions.frameDimensionsInMm : undefined
    };
}

function createConfig(selectedValues, coloringScheme, filename) {
    const {
        fanAngle, selectedDates, selectedPlaces, selectedContemporary,
        coloring, maxGenerations, showMarriages, showMissing, givenThenFamilyName,
        showFirstNameOnly, substituteEvents, invertTextArc, isTimeVisualisationEnabled,
        title, titleSize, titleMargin
    } = selectedValues;

    const dimensions = calculateDimensions(fanAngle, maxGenerations, showMarriages); // TODO à vérifier

    // Utilisation des variables pour les poids de génération et d'autres sélections dynamiques
    return {
        root: individualSelect.val(), // Assumant que individualSelect est déjà défini
        maxGenerations,
        angle: 2 * Math.PI * fanAngle / 360.0,
        dates: {
            showYearsOnly: selectedDates === 0,
            showInvalidDates: document.querySelector('#show-invalid-dates').checked
        },
        places: {
            showPlaces: selectedPlaces !== 2,
            showReducedPlaces: selectedPlaces === 1
        },
        showMarriages,
        showMissing,
        givenThenFamilyName,
        showFirstNameOnly,
        substituteEvents,
        invertTextArc,
        isTimeVisualisationEnabled,
        title,
        titleSize: titleSize / 100.0,
        titleMargin: titleMargin / 100.0,
        weights: {
            generations: weightGenerations.map(e => parseInt(e.value, 10) / 100.0),
            strokes: parseInt(strokeWeight.value, 10) / 1000.0
        },
        contemporary: {
            showEvents: selectedContemporary === 0,
            showNames: selectedContemporary < 2,
            trulyAll: selectedContemporary === 3,
            generations: parseInt(hiddenGenerationsCount.value, 10)
        },
        colors: {
            individuals: colorValue(colorIndividuals),
            marriages: colorValue(colorMarriages),
            textContrast: textContrast.checked,
            scheme: coloringScheme,
            color1: colorValue(color1),
            color2: colorValue(color2),
            colorStart: colorValue(colorStart),
            colorEnd: colorValue(colorEnd),
            saturation: parseInt(saturation.value, 10) / 100.0,
            value: parseInt(value.value, 10) / 100.0,
            randomSelection: randomSelection.checked
        },
        fanDimensions: dimensions.fanWidthInMm,
        frameDimensions: dimensions.frameDimensionsInMm,
        computeChildrenCount: coloring === 'childrencount',
        filename: filename  
    };
}

function formatName(result) {
    return (result.name || result.surname ? ' ' : '') + (result.name ? result.name : '') +
        (result.name && result.surname ? ' ' : '') + (result.surname ? result.surname : '');
}

function onSettingChange() {
    const selectedValues = getSelectedValues();
    const coloringScheme = coloringSchemes[selectedValues.coloring];
    if (previousColoring !== selectedValues.coloring) {
        onColoringChange(coloringScheme);
    }
    previousColoring = selectedValues.coloring;
    const dimensions = calculateDimensions(selectedValues.fanAngle, selectedValues.maxGenerations, selectedValues.showMarriages);

    // Première création de la configuration sans le nom de fichier
    config = createConfig(selectedValues, coloringScheme);

    const result = draw(json, config);
    if (!result) {
        return false;
    }

    rootIndividual = formatName(result);
    
    filename = (__('éventail généalogique de ') + formatName(result) + ' créé sur genealog.ie')
        .replace(/[|&;$%@"<>()+,]/g, ''); // Filename sanitizing

    // Mise à jour de la configuration avec le nom de fichier
    config.filename = filename;
    updateFilename(config.filename);

    shouldShowInitialMessage = false;

    $('#initial-group').hide();
    
    if (dimensions !== previousDimensions) {
        previousDimensions = dimensions;
        resetZoom();
    }

    return true;
}

setupParameterEventListeners(onSettingChange);
setupTooltipAndColorPicker(onSettingChange);

function onColoringChange(scheme) {
    $('.group-color').css('display', 'none'); // Hide all
    // Show only one
    if (scheme == null)
        return;
    if (scheme.type === COLORING_DUAL) {
        $('#group-color-dual').css('display', '');

        $('#color1').parent().data('colorpicker').setValue(scheme.color1);
        $('#color2').parent().data('colorpicker').setValue(scheme.color2);
    } else if (scheme.type === COLORING_GRADIENT) {
        $('#group-color-gradient').css('display', '');

        $('#color-start').parent().data('colorpicker').setValue(scheme.colorStart);
        $('#color-end').parent().data('colorpicker').setValue(scheme.colorEnd);
    } else if (scheme.type === COLORING_TEXTUAL) {
        $('#group-color-textual').css('display', '');
    }
}

function loadFile(files) {
    const file = files[0];
    const reader = new FileReader();

    reader.addEventListener("loadend", function() {
        const data = reader.result;

        onFileChange(data);
    });

    reader.readAsArrayBuffer(file);
}

$("#file").change(function(e) {
    loadFile(e.target.files);
});

individualSelect.on('change', function() {
    onSettingChange();
});

function zoom(scale) {
    if (map != null) {
        const previewContainer = $('#preview');
        const transform = map.getTransform();
        const deltaX = transform.x,
            deltaY = transform.y;
        const offsetX = 1 / scale * previewContainer.width() / 2 + deltaX,
            offsetY = 1 / scale * previewContainer.height() / 2 + deltaY;

        map.zoomTo(previewContainer.width() / 2, previewContainer.height() / 2, scale);
    }
}

const zoomFactor = 0.1;

$("#zoom-plus").click(function() {
    zoom(1 + zoomFactor);
    return false;
});

$("#zoom-minus").click(function() {
    zoom(1 - zoomFactor);
    return false;
});

$("#zoom-reset").click(function() {
    resetZoom();
    return false;
});

$("#full-screen-toggle").click(function() {
    toggleFullscreen();
    return false;
});

const zoomButtons = $(".button-zoom");

zoomButtons.mousedown(function() {
    return false;
});

zoomButtons.dblclick(function() {
    return false;
});

// Fonction pour afficher la fenêtre modale
function promptForEmail() {
    $('#emailModal').modal('show');
}

// Fonction pour afficher la fenêtre modale de confirmation
function showConfirmationModal(message) {
    $('#confirmationModalLabel').text('Confirmation');
    $('#confirmationModal .modal-body').text(message);
    $('#confirmationModal').modal('show');
}

// Modifiez le gestionnaire de clic pour utiliser la fenêtre modale
$("#download-pdf").click(function() {
    promptForEmail();
    return false; // Prevent default link action
});

$("#download-pdf-watermark").click(function() {
    // console.log(config);
    generatePdf(config, function(blob) {
        downloadContent(blob, generateFileName("pdf"), "pdf");
    }, true);

    return false; // Prevent default link action
});

$("#download-svg").click(function() {
    d3.selectAll('#boxes *')
        .style('stroke', 'rgb(0, 0, 255)')
        .style('-inkscape-stroke', 'hairline')
        .attr('stroke-width', '0.01');
    downloadContent(fanAsXml(), generateFileName("svg"), "svg");
    return false;
});

$("#download-png-transparency").click(function() {
    downloadPNG(config, true);
    return false;
});

$("#download-png-background").click(function() {
    downloadPNG(config, false);
    return false;
});

$("#print").click(function() {
    function printPdf(url) {
        const iframe = document.createElement('iframe');
        iframe.className = 'pdfIframe';
        document.body.appendChild(iframe);
        iframe.style.position = 'absolute';
        iframe.style.left = '-10000px';
        iframe.style.top = '-10000px';
        iframe.onload = function() {
            setTimeout(function() {
                iframe.focus();
                try {
                    iframe.contentWindow.print();
                } catch (e) { // Fallback
                    console.log('Cannot print, downloading instead');
                    $("#download-pdf").click();
                }
                URL.revokeObjectURL(url);
            }, 1);
        };
        iframe.src = url;
    }

    $("#download-pdf").click(); // Workaround (chrome update)

    return false;
});

function loadExternal(url) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function(e) {
        if (this.status === 200) {
            const data = xhr.response;
            onFileChange(data);
        } else {
            window.alert(__('arbreomatic.cannot_read_this_file')); // FIXME
        }
    };
    xhr.send();
}

$('#preview').on("click", function() {
    if (shouldShowInitialMessage) {
        $('#file').click();
    }
}).on('drop', function(e) {
    $('#preview').removeClass('preview-drop');
    if (e.originalEvent.dataTransfer && e.originalEvent.dataTransfer.files.length > 0) {
        e.preventDefault();
        e.stopPropagation();

        loadFile(e.originalEvent.dataTransfer.files);
    }
    return false;
}).on('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
}).on('dragenter', function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (shouldShowInitialMessage) {
        $('#preview').addClass('preview-drop');
    }
    return false;
}).on('dragleave', function() {
    $('#preview').removeClass('preview-drop');
    return false;
});


$('#sample-toggle').click(function() {
    $('#sample-modal').modal('show');
    //loadExternal('shakespeare.ged');
    return false;
});

$('.sample').click(function(e) {
    loadExternal($(e.target).attr('data-link'));
    return false;
});

$('#help').click(function(e) {
    $('#help-modal').modal('show');
    return false;
});

$('#news-button').click(function(e) {
    $('#news-modal').modal('show');
    return false;
});

// Prevent the user from entering invalid quantities
$('input[type=number]').change(function() {
    const _this = $(this);
    const min = parseInt(_this.attr('min'));
    const max = parseInt(_this.attr('max'));
    const val = parseInt(_this.val()) || (min - 1);
    if (val < min)
        _this.val(min);
    if (val > max)
        _this.val(max);
});

$('.gradient-group').on('colorpickerChange colorpickerCreate', function(e) {
    const preview = $('#gradient-preview');
    preview.css('background', 'linear-gradient(to right, ' + colorValue('#color-start') + ', ' + colorValue('#color-end') + ')');
});

export function initPage() {
    if (isReady) {
        $('#overlay').addClass('overlay-hidden');
        $('body').css('overflow', 'auto');
    }
    handleUrlParameters();
}

setupPageInitialization();

function handleUrlParameters() {
    var urlParams = new URLSearchParams(window.location.search);
    var contexte = urlParams.get('contexte');
    
    if (contexte === 'demo') {
        $('#download-svg').hide();
        $('#download-png-transparency').hide();
        $('#download-png-background').hide();
        $('#advanced-parameters').hide();

        // Cacher le conteneur de la case à cocher, y compris le label
        $('#show-missing').closest('.col').hide();
    }
}
