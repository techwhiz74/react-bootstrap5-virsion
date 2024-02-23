import { proceedWithPdfDownload } from './downloads.js';
import { resetZoom, initPage } from './ui.js';

function debounce(func, wait, immediate) {
    var timeout;
    return function() {
        var context = this, args = arguments;
        var later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        var callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

// Gestionnaire pour la soumission de l'email
async function handleEmailSubmit() {
    try {
        const response = await fetch('https://emailvalidation.genealogie.workers.dev/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: document.getElementById("userEmailInput").value })
        });
        const data = await response.json();
        if (data.result === "ok" || data.result === "ok_for_all") {
            localStorage.setItem("userEmail", userEmail);
            $('#emailModal').modal('hide');
            proceedWithPdfDownload();
        } else {
            alert("L'adresse de courriel indiquée n'est pas valide. Veuillez recommencer.");
        }
    } catch (error) {
        console.error('Erreur lors de la validation de l\'email:', error);
        alert("Erreur lors de la validation de l'email. Veuillez réessayer.");
    }
}

function enterFullscreen(element) {
    var requestFullscreen = element.requestFullscreen || element.mozRequestFullScreen || element.webkitRequestFullscreen || element.msRequestFullscreen;
    if (requestFullscreen) {
        requestFullscreen.call(element);
    }
}

function exitFullscreen() {
    var exitFullscreen = document.exitFullscreen || document.mozCancelFullScreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (exitFullscreen) {
        exitFullscreen.call(document);
    }
}

function toggleFullscreen() {
    var fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    if (fullscreenElement) {
        exitFullscreen();
    } else {
        enterFullscreen($('#preview').get(0));
    }
}

export function setupAllEventListeners() {
    document.addEventListener('DOMContentLoaded', function() {
        document.getElementById('email').addEventListener('click', handleEmailSubmit);
        document.getElementById('full-screen-toggle').addEventListener('click', toggleFullscreen);

        let collapseToolbar = document.getElementById('collapseToolbar');
        // Gestionnaires d'événements spécifiques à Bootstrap 4
        $(collapseToolbar).on('shown.bs.collapse', onToolbarShown);
        $(collapseToolbar).on('hidden.bs.collapse', onToolbarHidden);

        if (collapseToolbar.classList.contains('show')) {
            onToolbarShown();
        } else {
            onToolbarHidden();
        }

        const debouncedResetZoom = debounce(resetZoom, 250);
        window.addEventListener('resize', debouncedResetZoom);
        resetZoom();

        if (contexte === 'demo') {
            $('#advanced-parameters').hide();
        }

        // Configuration des écouteurs d'événements de plein écran
        ['fullscreenchange', 'mozfullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'].forEach(event => {
            document.addEventListener(event, handleFullScreenChange, false);
        });
    });
}

export function setupParameterEventListeners(onSettingChange) {
    document.querySelectorAll('.parameter').forEach(item => {
        item.addEventListener('change', onSettingChange);
    });
}

function handleFullScreenChange() {
    resetZoom();
}


const onToolbarShown = () => {
    const preview = document.getElementById('preview');
    preview.style.zIndex = "90";
}

const onToolbarHidden = () => {
    const preview = document.getElementById('preview');
    preview.style.zIndex = "101";
    addToggleLink();
}

function addToggleLink() {
    let preview = document.getElementById('preview');
    let existingLink = preview.querySelector('.toolbar-toggle');
    if (!existingLink) {
        let toggleLink = document.createElement('a');
        toggleLink.setAttribute('data-toggle', 'collapse');
        toggleLink.setAttribute('href', '#collapseToolbar');
        toggleLink.setAttribute('aria-expanded', 'true');
        toggleLink.setAttribute('aria-controls', 'collapseToolbar');
        toggleLink.className = 'toolbar-toggle';
        toggleLink.innerHTML = '<h6>Cliquez ici pour configurer votre éventail</h6>';
        preview.appendChild(toggleLink);
        toggleLink.style.cssText = 'position: absolute; top: 10px; left: 10px; z-index: 102;';
    }
}

export function setupTooltipAndColorPicker(onSettingChange) {
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl, {
            placement: 'top'
        })
    })
    // document.que('[data-toggle="tooltip"]').tooltip(); // Bootstrap 4 tooltips
    // $('.colorpicker-group')
    //     .colorpicker({ // Color picker plugin
    //         format: 'hex',
    //         useAlpha: false,
    //         placement: 'top',
    //         fallbackColor: '#ffffff'
    //     })
    //     .on('colorpickerHide', function() {
    //         if (json != null) {
    //             onSettingChange();
    //         }
    //     })
    //     .each(function() {
    //         $(this).data('colorpicker').disable()
    //     });

    // $('.colorpicker-group input').blur(onSettingChange);
}

export function setupPageInitialization() {
    $(document).ready(function() {
        initPage();
    });
}