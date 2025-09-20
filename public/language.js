
function setLanguage(lang) {
    localStorage.setItem('language', lang);
    updateContent();
}

function getLanguage() {
    return localStorage.getItem('language') || 'ja';
}

function updateContent() {
    const lang = getLanguage();
    const elements = document.querySelectorAll('[data-lang-key]');
    elements.forEach(element => {
        const key = element.getAttribute('data-lang-key');
        if (translations[lang] && translations[lang][key]) {
            // Handle different element types
            const translation = translations[lang][key];
            if (element.tagName === 'TITLE' || element.tagName === 'H1' || element.tagName === 'H2' || element.tagName === 'H3' || element.tagName === 'H4' || element.tagName === 'H5' || element.tagName === 'P' || element.tagName === 'A' || element.tagName === 'BUTTON' || element.tagName === 'LABEL' || element.tagName === 'SPAN' || element.tagName === 'SMALL' || element.tagName === 'STRONG' || element.tagName === 'LI') {
                element.innerHTML = translation;
            } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                if(element.placeholder) {
                    element.placeholder = translation;
                }
            } else if (element.tagName === 'META' && element.name === 'description') {
                element.content = translation;
            } else if (element.tagName === 'IMG') {
                element.alt = translation;
            } else {
                element.textContent = translation;
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    updateContent();
});
