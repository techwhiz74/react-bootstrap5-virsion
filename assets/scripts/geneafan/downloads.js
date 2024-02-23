import SVGtoPDF from 'svg-to-pdfkit';
import PDFDocument from 'pdfkit'
import blobStream from 'blob-stream';
import { mmToPoints } from './utils.js';

const PAGE_WIDTH_IN_MM = 297; // Largeur en millimètres
const PAGE_HEIGHT_IN_MM = 420; // Hauteur en millimètres

export let filename;

export function updateFilename(newFilename) {
    filename = newFilename;
}

export function downloadContent(data, type) {
    const file = new Blob([data], { type: type });
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
        const a = document.createElement("a"),
            url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    }
}

export function fanAsXml() {
    const svg = $("#fan")[0];
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svg);

    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!source.match(/^<svg[^>]+"http:\/\/www\.w3\.org\/1999\/xlink"/)) {
        source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }
    source = source.replace(/href/g, 'xlink:href'); // Compatibility

    source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

    return source;
}

/*
export function calculateFrameDimensions() {
    const { fanAngle, maxGenerations, showMarriages } = getSelectedValues();
    const { frameDimensionsInMm } = calculateDimensions(fanAngle, maxGenerations, showMarriages);
    return frameDimensionsInMm ? frameDimensionsInMm.split('x').map(Number) : [0, 0];
}
*/

function getFrameDimensions(frameDimensionsInMm) {
    return frameDimensionsInMm.split('x').map(Number);
}

export function generatePdf(config, callback, watermark = true) {
    // Frame dimensions
    const frameDimensionsInMm = config.frameDimensions;
    let frameWidthInMm, frameHeightInMm;
    [frameWidthInMm, frameHeightInMm] = getFrameDimensions(frameDimensionsInMm);

    // Page dimensions
    const pageWidthInPoints = mmToPoints(PAGE_WIDTH_IN_MM);
    const pageHeightInPoints = mmToPoints(PAGE_HEIGHT_IN_MM);

    const layoutMap = {
        '331x287': 'landscape',
        '260x260': 'landscape',
        '331x331': 'landscape'
    };
    const layout = layoutMap[frameDimensionsInMm];

    const doc = new PDFDocument({
        size: [pageWidthInPoints, pageHeightInPoints],
        margins: {
            top: 28,
            bottom: 28,
            left: 28,
            right: 28
        },
        layout : layout,
        info: {
            Title: filename, // Title of the document
            Author: 'https://genealog.ie', // Name of the author
            Subject: __('arbreomatic.genealogical_fan'), // Subject of the document
            Keywords: 'généalogie;arbre;éventail;genealog.ie', // Keywords (no translation)
            //CreationDate: 'DD/MM/YYYY', // Date created (added automatically by PDFKit)
            //ModDate: 'DD/MM/YYYY' // Date last modified
        }
    });
    
    // Ajouter le filigrane
    if (watermark) {
        const watermarkText = 'Genealog.ie';
        const fontSize = 100;

        doc.fontSize(fontSize); // Définir la taille de la police

        const textWidth = doc.widthOfString(watermarkText);

        const isLandscape = doc.options.layout === 'landscape';
        const textY = isLandscape ? pageWidthInPoints * 2 / 3 : pageHeightInPoints * 2 / 3;
        const textX = isLandscape ? (pageHeightInPoints - textWidth) / 2 : (pageWidthInPoints - textWidth) / 2;

        doc.fillColor('grey') // Définir la couleur du texte
            .opacity(0.5) // Définir l'opacité
            .text(watermarkText, textX, textY); // Ajouter le texte
    }

    const stream = doc.pipe(blobStream());
    stream.on('finish', function() {
        const blob = stream.toBlob('application/pdf');
        callback(blob);
    });

    const svgOptions = {
        width: mmToPoints(frameWidthInMm),
        height: mmToPoints(frameHeightInMm)
    };

    let x, y;

    if (pageWidthInPoints > pageHeightInPoints) {
    // Paysage
        x = (pageWidthInPoints - svgOptions.width) / 2;
        y = (pageHeightInPoints - svgOptions.height) / 2;
    } else {
    // Portrait
        x = (pageHeightInPoints - svgOptions.width) / 2;
        y = (pageWidthInPoints - svgOptions.height) / 2;
    }

    SVGtoPDF(doc, fanAsXml().trim(), x, y, svgOptions);

    doc.end();
}

export function generateFileName(extension) {
    return filename + '.' + extension;
}

// Fonction pour envoyer le PDF vers make.com
export function proceedWithPdfDownload() {
    const userEmail = localStorage.getItem("userEmail") || "anonymous";

    generatePdf(config, function(blob) {
        let formData = new FormData();
        formData.append('file', blob, config.filename + ' par ' + userEmail + ".pdf");
        formData.append('email', userEmail);
        formData.append('rootIndividual', rootIndividual);
    
        fetch('https://hook.eu1.make.com/ogsm7ah5ftt89p6biph0wd1vt8b50zwy', {
            method: 'POST',
            body: formData,
        })
            .then(response => {
                if (response.ok) {
                    showConfirmationModal('Consultez votre boîte de courriel dans quelques minutes.');
                } else {
                    showConfirmationModal('Erreur lors de l\'envoi du PDF.');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showConfirmationModal('Une erreur est survenue.');
            });
    }, false); // No watermark
}

function generatePNG(config, transparency) {
    return new Promise((resolve, reject) => {
        const svgString = fanAsXml();
        const canvas = document.createElement("canvas");
        const fan = $("#fan");

        const frameDimensionsInMm = config.frameDimensions;
        let frameWidthInMm, frameHeightInMm;
        [frameWidthInMm, frameHeightInMm] = getFrameDimensions(frameDimensionsInMm);


        const dpi = 96; // Change this value if your DPI is different
        canvas.width = Math.round(frameWidthInMm * dpi / 25.4);
        canvas.height = Math.round(frameHeightInMm * dpi / 25.4);

        //console.log("Canvas width: " + canvas.width + ", height: " + canvas.height);
        const ctx = canvas.getContext("2d");

        if (!transparency) {
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        const DOMURL = self.URL || self.webkitURL || self;
        const img = new Image();
        const svg = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });

        if (!(svg instanceof Blob)) {
            reject(new Error('svg is not a Blob'));
        }

        const url = URL.createObjectURL(svg);

        img.onload = function() {
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(function(blob) {
                if (!(blob instanceof Blob)) {
                    reject(new Error('blob is not a Blob'));
                }
                resolve(blob);
            }, 'image/png');
        };
        
        img.onerror = function() {
            reject(new Error('Image loading error'));
        };

        img.src = url;
    });
}

export function downloadPNG(config, transparency) {
    generatePNG(config, transparency).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = generateFileName("png");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }).catch(error => {
        console.error('Error generating or downloading PNG:', error);
    });
}


