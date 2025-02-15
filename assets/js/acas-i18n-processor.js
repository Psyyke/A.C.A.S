(function(){
	let storageLanguageKey = 'selectedLanguage';
	let currentLang = 'us';
	let configTranslations = {};
	let domTranslations = {};
	let contributors = [];
	let availableLanguages = [];
	let firstLoad = true;
	let triedToLoadAgain = false;
	let isSecondaryPage = window?.isAcasSecondaryPage;

	let mutationCounter = 0;

	setInterval(() => {
		mutationCounter = 0;
	}, 1000);

	function getFlagPath(languageCode) {
		return `assets/images/flags/${languageCode}.svg`;
	}

	function initializeLanguageDropdown(dropdownElem) {
		// Avoid re-attaching event listeners
		if (dropdownElem.dataset.initialized) return;
		dropdownElem.dataset.initialized = "true";
	
		// Fill dropdown with available languages
		const listContainer = dropdownElem.querySelector('.dropdown-list-container');
		const selectedFlagImg = listContainer.parentElement.querySelector('img');

		selectedFlagImg.src = getFlagPath(currentLang);

		if (listContainer) {
			availableLanguages.forEach(x => {
				const languageCode = x[0];
				const languageSearchTerm = x[1];
				const svgPath = getFlagPath(languageCode);

				const dropdownItem = document.createElement('div');
				dropdownItem.classList.add('dropdown-item');
				dropdownItem.dataset.value = languageSearchTerm;
				dropdownItem.title = languageSearchTerm + ` (${languageCode})`;
				dropdownItem.innerHTML = `<img>`;
		
				dropdownItem.querySelector('img').src = svgPath;
		
				listContainer.appendChild(dropdownItem);

				dropdownItem.onclick = function() {
					localStorage.setItem(storageLanguageKey, languageCode);

					selectedFlagImg.src = svgPath;

					load(languageCode, true);
				};
			});
		}
	}

	async function load(lang, userActivated){
		try {
			const additionalPrefix = isSecondaryPage ? '../' : '';

			const response = await fetch(additionalPrefix + `assets/i18n/${lang}.json`);
			const translationObj = await response.json();

			const metaResponse = await fetch(additionalPrefix + `assets/i18n/meta.json`);
			const metaObj = await metaResponse.json();
			const availableLanguagesArr = metaObj.availableLanguages;

			domTranslations = translationObj.domTranslations;
			configTranslations = translationObj.configTranslations;
			transObj = translationObj.translations; // set global variable on acas-globals.js so that other files can access translations
			contributors = translationObj.contributors;
			currentLang = lang;

			availableLanguages = availableLanguagesArr;

			if(userActivated) {
				const msg = transObj.thankYouTranslator ?? 'Thanks to the translators';
			
				toast.message(msg + ' 🥰' + `\n(${contributors.length ? contributors.join(', ') : 'ChatGPT'})`, 5000);
			}

			updateTextContent();
			translateConfig();

			if(firstLoad) {
				const observer = new MutationObserver(m => {
					if(mutationCounter<25) {
						updateTextContent();
					}
	
					document.querySelectorAll('.language-dropdown-input')
						.forEach(initializeLanguageDropdown);
	
					mutationCounter++;
				});
	
				observer.observe(document, { childList: true, subtree: true });
			}
		} catch(error){
			console.error(`Error while loading language file for ${lang}:`, error);

			if(!triedToLoadAgain) {
				triedToLoadAgain = true;
				currentLang = 'us';
				localStorage.setItem(storageLanguageKey, currentLang);

				load(currentLang);
			}
		}

		firstLoad = false;
	}

	function translateConfig() {
		Object.keys(configTranslations).map(async key => {
			const parentElement = await waitForElement(`[data-key="${key}"]`);
			const customInputElem = parentElement?.closest('.custom-input');

			const titleElement = customInputElem.querySelector('.input-title');
			const subtitleElement = customInputElem.querySelector('.input-subtitle');

			const [titleText, subtitleText] = configTranslations[key];

			if(titleElement && titleText) {
				titleElement.innerText = titleText;
			}

			if(subtitleElement && subtitleText) {
				subtitleElement.innerText = subtitleText;
			}
		});
	}

	function comparisonFormat(text) {
		return text
			.toLowerCase()
			.replaceAll(' ', '')
			.replaceAll('\n', '');
	}

	function updateTextContent() {
		Object.keys(domTranslations).forEach(query => {
			const elemArr = [...document.querySelectorAll(query)];

			if(elemArr?.length) {
				const translation = domTranslations[query];

				elemArr
					.filter(x => comparisonFormat(x.innerText) !== comparisonFormat(translation))
					.forEach(x => {
						console.warn('Translated:', x.innerText, '-->',  translation);

						x.innerText = translation;
					});
			}
		});
	}

	const savedLanguage = localStorage.getItem(storageLanguageKey) || currentLang;

	load(savedLanguage);
})();