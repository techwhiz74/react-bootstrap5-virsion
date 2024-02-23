 // TODO start moving functions into this file

export function padTwoDigits(n) {
    const s = n.toString();
    return s.length === 1 ? '0' + s : s;
}

export function mmToPoints(mm) {
    return mm * 72 / 25.4;
}

export function mmToPixels(mm) {
    return mm * 3.78;
}

export function debounce(func, wait, immediate) {
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