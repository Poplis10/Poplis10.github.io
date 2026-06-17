if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('sw.js')
}

// --- KONFIGURACJA FIREBASE ---
const firebaseConfig = {
	apiKey: 'AIzaSyBRVtplChkbGQsT10SvQXnYywLYKRVIY3E',
	authDomain: 'jadlospis-bee5a.firebaseapp.com',
	databaseURL: 'https://jadlospis-bee5a-default-rtdb.europe-west1.firebasedatabase.app/',
	projectId: 'jadlospis-bee5a',
	storageBucket: 'jadlospis-bee5a.firebasestorage.app',
	messagingSenderId: '934978468199',
	appId: '1:934978468199:web:354a6cb971784796b497c2',
}

// Inicjalizacja (Styl Compat)
firebase.initializeApp(firebaseConfig)
const db = firebase.database()
let globalMealDatabase = [] // Tutaj będziemy trzymać dania z chmury

// Test połączenia w konsoli (F12)
db.ref('.info/connected').on('value', snap => {
	console.log(snap.val() === true ? '✅ Połączono z bazą Firebase' : '❌ Brak połączenia')
})

// 1. ODBIERANIE TABELI (PLANU TYGODNIA)
db.ref('weeklyPlan').on('value', snapshot => {
	const data = snapshot.val() || {}
	document.querySelectorAll('td[id]').forEach(cell => {
		if (data[cell.id]) {
			fillTableCell(cell, data[cell.id].name, data[cell.id].ingredients, data[cell.id].recipe || '')
		} else {
			cell.innerHTML = `<button class="add-btn table-btn" onclick="openMealPicker(this)">+</button>`
			cell.style.padding = '5px'
		}
	})
})

// 2. ODBIERANIE BAZY DAŃ (TWOICH PRZEPISÓW)
db.ref('mealDatabase').on('value', snapshot => {
	const rawData = snapshot.val() || []

	let dataArray = Array.isArray(rawData) ? rawData : Object.values(rawData)
	dataArray = dataArray.filter(meal => meal && meal.name)

	// --- SORTOWANIE ALFABETYCZNE ---
	dataArray.sort((a, b) => a.name.localeCompare(b.name, 'pl', { sensitivity: 'base' }))

	globalMealDatabase = dataArray

	// Czyszczenie wszystkich akordeonów przed ponownym renderрованием
	document.querySelectorAll('.category-content').forEach(c => (c.innerHTML = ''))

	// Renderowanie posortowanych dań
	dataArray.forEach(meal => {
		if (meal.category) {
			createNewMealCard(
				meal.category,
				meal.name,
				meal.ingredients || '',
				meal.recipe || '',
				false, // shouldSave = false, bo dane czytamy Z bazy
				meal.gotowiecData || null,
			)
		}
	})

	// AKTUALIZACJA LICZNIKÓW
	updateAllCounts()

	// SYNCHRONIZACJA DANYCH W TABELI
	const allPlannedMeals = document.querySelectorAll('.meal-container')
	let localTableUpdated = false

	allPlannedMeals.forEach(container => {
		const mealNameInTable = container.querySelector('.meal-name-text').innerText

		let updatedIngredients = null
		let updatedRecipe = null
		let found = false

		// 1. Najpierw szukamy w zwykłych daniach
		const updatedMeal = globalMealDatabase.find(m => m.name === mealNameInTable && m.category !== 'gotowiec')

		if (updatedMeal) {
			updatedIngredients = updatedMeal.ingredients || ''
			updatedRecipe = updatedMeal.recipe || ''
			found = true
		} else {
			// 2. Jeśli nie znaleziono, głębokie przeszukanie pod-dań wewnątrz gotowców
			for (const meal of globalMealDatabase) {
				if (meal.category === 'gotowiec' && meal.gotowiecData) {
					const subMeal = Object.values(meal.gotowiecData).find(sm => sm.name === mealNameInTable)
					if (subMeal) {
						updatedIngredients = subMeal.ingredients || ''
						updatedRecipe = subMeal.recipe || ''
						found = true
						break // Znalezione, przerywamy pętlę for
					}
				}
			}
		}

		// Jeśli znaleźliśmy dopasowanie w bazie, sprawdzamy czy zmieniła się treść
		if (found) {
			const currentIng = container.getAttribute('data-ingredients') || ''
			const currentRec = container.getAttribute('data-recipe') || ''

			if (currentIng !== updatedIngredients || currentRec !== updatedRecipe) {
				container.setAttribute('data-ingredients', updatedIngredients)
				container.setAttribute('data-recipe', updatedRecipe)
				localTableUpdated = true
			}
		}
	})

	if (localTableUpdated) {
		saveTableToLocalStorage()
	}
})

// --- KONFIGURACJA I STATE ---
const modal = document.getElementById('modalOverlay')
const openBtn = document.getElementById('openFormBtn')
const cancelBtn = document.getElementById('cancelBtn')
const mealForm = document.getElementById('mealForm')
let editingCard = null

document.addEventListener('DOMContentLoaded', () => {
	const isAuth = localStorage.getItem('isAppAuthorized') === 'true'
	updateAuthUI(isAuth)
	initTheme()

	// Inicjalizacja domyślnego widoku formularza bazowego
	toggleFormFields()

	// Poprawione ID z "modal-category-select" na "db-category-select" (zgodnie z HTML)
	const categorySelect = document.getElementById('db-category-select')
	if (categorySelect) {
		categorySelect.addEventListener('change', toggleFormFields)
	}

	// Obsługa zapisu formularza dodawania do bazy
	const dbForm = document.getElementById('addToDatabaseForm')
	if (dbForm) {
		dbForm.addEventListener('submit', handleDatabaseFormSubmit)
	}

	// Rozgrzewanie animacji (Hover)
	document.querySelectorAll('.category-accordion').forEach(acc => {
		acc.addEventListener(
			'mouseenter',
			() => {
				const wrapper = acc.querySelector('.category-wrapper')
				const forceLayout = wrapper.scrollHeight
			},
			{ once: true },
		)
	})

	// Obsługa otwierania/zamykania akordeonów
	document.querySelectorAll('.category-accordion summary').forEach(summary => {
		summary.addEventListener('click', e => {
			const details = summary.parentElement
			const wrapper = details.querySelector('.category-wrapper')

			if (details.open) {
				e.preventDefault()
				details.classList.add('closing')
				setTimeout(() => {
					details.open = false
					details.classList.remove('closing')
				}, 400)
			} else {
				const preCalculation = wrapper.scrollHeight
			}
		})
	})

	updateAllCounts()
})

// --- FUNKCJE OBSŁUGI MODALA I BAZY ---

// Przełączanie widoków w formularzu
function toggleFormFields() {
	const categorySelect = document.getElementById('db-category-select')
	const singleMealFields = document.getElementById('singleMealFields')
	const gotowiecFields = document.getElementById('gotowiecFields')
	const nameInput = document.getElementById('mealNameInput')

	if (!categorySelect || !singleMealFields || !gotowiecFields) return

	if (categorySelect.value === 'gotowiec') {
		singleMealFields.style.display = 'none'
		gotowiecFields.style.display = 'block'
		if (nameInput) nameInput.placeholder = 'Wpisz nazwę zestawu (np. Dzień 1)...'
	} else {
		singleMealFields.style.display = 'flex'
		gotowiecFields.style.display = 'none'
		if (nameInput) nameInput.placeholder = 'Wpisz nazwę (np. Shakshuka)...'
	}
}

// Przechwycenie wysyłki formularza i zapis w Realtime Database
async function handleDatabaseFormSubmit(e) {
	e.preventDefault() // Blokada przeładowania strony

	// TA LINIJKA MUSI BYĆ TUTAJ – przed jakimikolwiek warunkami if!
	const form = e.target

	// === NOWY WARUNEK: EDYCJA SAMEJ NAZWY ZESTAWU ===
	if (form && form.getAttribute('data-mode') === 'edit-gotowiec-name') {
		const oldName = form.getAttribute('data-old-name')
		const nameInput = document.getElementById('mealNameInput')
		const newName = nameInput ? nameInput.value.trim() : ''

		if (!newName) {
			alert('Nazwa zestawu nie może być pusta!')
			return
		}

		await saveGotowiecNameFromModal(oldName, newName)
		return // Przerywamy, żeby nie dodało nowego posiłku
	}
	// ===============================================

	// === TUTAJ SPRAWDZAMY CZY FORMULARZ JEST W TRYBIE EDYCJI SUB-DANIA ===
	if (form && form.getAttribute('data-mode') === 'edit-sub-meal') {
		const parentName = form.getAttribute('data-parent-name')
		const subKey = form.getAttribute('data-sub-key')

		const nameInput = document.getElementById('mealNameInput')
		const newName = nameInput ? nameInput.value : 'Bez nazwy'
		const newIngredients = document.getElementById('ingredientsInput').value
		const newRecipe = document.getElementById('recipeInput').value

		await saveSubMealFromModal(parentName, subKey, newName, newIngredients, newRecipe)
		return
	}

	// === 2. INTELIGENTNA LOGIKA ZAPISU (ZAPOBIEGANIE DUPLIKATOM) ===
	const category = document.getElementById('db-category-select').value
	const nameInputEl = document.getElementById('mealNameInput')
	const mainName = nameInputEl ? nameInputEl.value.trim() : ''

	if (!mainName) {
		alert('Nazwa posiłku nie może być pusta!')
		return
	}

	let mealData = {
		category: category,
		name: mainName,
	}

	// Budowanie struktury na podstawie wybranego typu
	if (category === 'gotowiec') {
		mealData.ingredients = ''
		mealData.recipe = ''
		mealData.gotowiecData = {
			breakfast: {
				name: document.getElementById('gotowiec-sn-name').value || 'Śniadanie',
				ingredients: document.getElementById('gotowiec-sn-ing').value,
				recipe: document.getElementById('gotowiec-sn-rec').value,
			},
			snack: {
				name: document.getElementById('gotowiec-pr-name').value || 'Przekąska',
				ingredients: document.getElementById('gotowiec-pr-ing').value,
				recipe: document.getElementById('gotowiec-pr-rec').value,
			},
			lunch: {
				name: document.getElementById('gotowiec-ob-name').value || 'Obiad',
				ingredients: document.getElementById('gotowiec-ob-ing').value,
				recipe: document.getElementById('gotowiec-ob-rec').value,
			},
			dinner: {
				name: document.getElementById('gotowiec-ko-name').value || 'Kolacja',
				ingredients: document.getElementById('gotowiec-ko-ing').value,
				recipe: document.getElementById('gotowiec-ko-rec').value,
			},
		}
	} else {
		// Standardowe pojedyncze danie
		mealData.ingredients = document.getElementById('ingredientsInput').value
		mealData.recipe = document.getElementById('recipeInput').value
		mealData.gotowiecData = null
	}

	// Zapis do Firebase Realtime Database z funkcją sprawdzania duplikatów
	try {
		// Określamy, czy szukamy po starej nazwie (tryb edycji), czy po aktualnie wpisanej
		const isEditMode = form.getAttribute('data-mode') === 'edit-meal'
		const searchName = isEditMode ? form.getAttribute('data-old-name') : mainName

		// Przeszukujemy bazę w poszukiwaniu dania o tej nazwie
		const snapshot = await db.ref('mealDatabase').orderByChild('name').equalTo(searchName).once('value')
		const data = snapshot.val()

		if (data) {
			// DANIE ISTNIEJE -> AKTUALIZACJA (Nadpisujemy istniejący węzeł)
			const firebaseKey = Object.keys(data)[0]
			await db.ref(`mealDatabase/${firebaseKey}`).set(mealData)
			alert('Posiłek został pomyślnie zaktualizowany w bazie!')
		} else {
			// NOWE DANIE -> PUSH
			await db.ref('mealDatabase').push(mealData)
			alert('Posiłek został pomyślnie dodany do bazy!')
		}

		// Czyszczenie flag, reset formularza i zamknięcie okna
		form.removeAttribute('data-mode')
		form.removeAttribute('data-old-name')
		form.reset()

		// Przywrócenie widoczności selecta kategorii (na wypadek gdyby był ukryty po edycji nazwy gotowca)
		const categorySelect = document.getElementById('db-category-select')
		if (categorySelect) {
			categorySelect.style.display = 'block'
			const label = categorySelect.closest('label') || categorySelect.previousElementSibling
			if (label && (label.tagName === 'LABEL' || label.classList.contains('form-group'))) {
				label.style.display = 'block'
			}
		}

		document.getElementById('modalOverlay').style.display = 'none'
		toggleFormFields()
	} catch (error) {
		console.error('Błąd zapisu Firebase:', error)
		alert('Wystąpił błąd podczas zapisu. Sprawdź konsolę (F12).')
	}
}

// Licznik elementów w akordeonach
function updateAllCounts() {
	const accordions = document.querySelectorAll('.category-accordion')

	accordions.forEach(acc => {
		// Używamy :not(.sub-card), aby liczyć tylko główne zestawy/dania
		const count = acc.querySelectorAll('.meal-card:not(.sub-card)').length
		const countSpan = acc.querySelector('.meal-count')

		if (countSpan) {
			countSpan.innerText = `(${count})`
		}
	})
}

async function saveGotowiecNameFromModal(oldName, newName) {
	try {
		// Szukamy zestawu w bazie po jego dotychczasowej nazwie
		const snapshot = await db.ref('mealDatabase').orderByChild('name').equalTo(oldName).once('value')
		const data = snapshot.val()

		if (data) {
			const firebaseKey = Object.keys(data)[0]

			// Aktualizujemy wyłącznie pole 'name' czystą, nową wartością
			await db.ref(`mealDatabase/${firebaseKey}/name`).set(newName)

			// Czyszczenie flag i reset formularza
			const dbForm = document.getElementById('addToDatabaseForm')
			if (dbForm) {
				dbForm.removeAttribute('data-mode')
				dbForm.removeAttribute('data-old-name')
				dbForm.reset()
			}

			// Zamknięcie modalu i przywrócenie widoków
			document.getElementById('modalOverlay').style.display = 'none'
			toggleFormFields()

			alert('Nazwa zestawu została pomyślnie zaktualizowana!')
		}
	} catch (error) {
		console.error('Błąd podczas zmiany nazwy zestawu:', error)
		alert('Wystąpił błąd podczas zmiany nazwy w bazie danych.')
	}
}

// --- TRYB CIEMNY ---

function initTheme() {
	const savedTheme = localStorage.getItem('theme')
	if (savedTheme === 'dark') {
		document.body.classList.add('dark-mode')
		updateThemeButton(true)
	}
}

function toggleTheme() {
	const isDark = document.body.classList.toggle('dark-mode')
	localStorage.setItem('theme', isDark ? 'dark' : 'light')
	updateThemeButton(isDark)
}

function updateThemeButton(isDark) {
	const btn = document.getElementById('theme-toggle')
	if (btn) {
		btn.innerText = isDark ? '☀️ Tryb Jasny' : '🌙 Tryb Ciemny'
	}
}

// Zamykanie modali po kliknięciu w tło
window.onclick = e => {
	if (e.target === modal) closeModal()
	const picker = document.getElementById('mealPickerModal')
	if (e.target === picker) closeMealPicker()
	const mealModal = document.getElementById('meal-modal')
	if (e.target === mealModal) closeModalBnt()
	const infoModal = document.getElementById('infoModal')
	if (e.target == infoModal) closeInfoModal()
}

// --- FUNKCJE ZAPISU ---

function saveDatabaseToLocalStorage() {
	const allCards = document.querySelectorAll('.meal-card')
	const mealsData = []
	allCards.forEach(card => {
		const cat = card.getAttribute('data-category')
		const mealObj = {
			category: cat,
			name: card.getAttribute('data-name'),
			ingredients: card.getAttribute('data-ingredients') || '',
			recipe: card.getAttribute('data-recipe') || '',
		}
		// Jeśli to gotowiec, zapisujemy jego całą strukturę wewnętrzną
		if (cat === 'gotowiec') {
			mealObj.gotowiecData = JSON.parse(card.getAttribute('data-gotowiec-data') || '{}')
		}
		mealsData.push(mealObj)
	})
	db.ref('mealDatabase').set(mealsData)
}

function saveTableToLocalStorage() {
	const tableData = {}
	document.querySelectorAll('td[id]').forEach(cell => {
		const mealDiv = cell.querySelector('.meal-container')
		if (mealDiv) {
			tableData[cell.id] = {
				name: mealDiv.querySelector('.meal-name-text').innerText,
				ingredients: mealDiv.getAttribute('data-ingredients'),
				recipe: mealDiv.getAttribute('data-recipe'), // Upewnij się, że to tu jest!
			}
		}
	})
	db.ref('weeklyPlan').set(tableData)
}

// --- LOGIKA BAZY POSIŁKÓW ---

mealForm.onsubmit = e => {
	e.preventDefault()
	const category = document.getElementById('modal-category-select').value
	const newName = document.getElementById('mealNameInput').value

	let ingredients = ''
	let recipe = ''
	let gotowiecData = null

	if (category === 'gotowiec') {
		// KLUCZE ZSYNCHRONIZOWANE Z UPDATE_MEAL_CARD I FIREBASE
		gotowiecData = {
			breakfast: {
				name: document.getElementById('gotowiec-sn-name').value,
				ingredients: document.getElementById('gotowiec-sn-ing').value,
				recipe: document.getElementById('gotowiec-sn-rec').value,
			},
			snack: {
				name: document.getElementById('gotowiec-pr-name').value,
				ingredients: document.getElementById('gotowiec-pr-ing').value,
				recipe: document.getElementById('gotowiec-pr-rec').value,
			},
			lunch: {
				name: document.getElementById('gotowiec-ob-name').value,
				ingredients: document.getElementById('gotowiec-ob-ing').value,
				recipe: document.getElementById('gotowiec-ob-rec').value,
			},
			dinner: {
				name: document.getElementById('gotowiec-ko-name').value,
				ingredients: document.getElementById('gotowiec-ko-ing').value,
				recipe: document.getElementById('gotowiec-ko-rec').value,
			},
		}
	} else {
		ingredients = document.getElementById('ingredientsInput').value
		recipe = document.getElementById('recipeInput').value
	}

	if (editingCard) {
		const oldName = editingCard.originalName

		if (oldName && oldName !== newName && category !== 'gotowiec') {
			document.querySelectorAll('.meal-container').forEach(container => {
				const textDiv = container.querySelector('.meal-name-text')
				if (textDiv && textDiv.innerText.trim() === oldName.trim()) {
					textDiv.innerText = newName
					container.setAttribute('data-ingredients', ingredients)
					container.setAttribute('data-recipe', recipe)
				}
			})
			saveTableToLocalStorage()
		}

		updateMealCard(editingCard, category, newName, ingredients, recipe, gotowiecData)
		editingCard.originalName = null
		editingCard = null
	} else {
		createNewMealCard(category, newName, ingredients, recipe, true, gotowiecData)
	}

	saveDatabaseToLocalStorage()
	closeModal()
}

function createNewMealCard(category, name, ingredients, recipe, shouldSave, gotowiecData = null) {
	const safeCat = category.replace('ą', 'a')
	const accordion = document.getElementById(`db-${safeCat}`)

	if (!accordion) return

	const targetSection = accordion.querySelector('.category-content')
	const mealCard = document.createElement('div')
	mealCard.className = 'meal-card'

	// Generujemy zawartość karty
	updateMealCard(mealCard, category, name, ingredients, recipe, gotowiecData)

	// Wrzucamy do odpowiedniej sekcji w akordeonie
	targetSection.appendChild(mealCard)

	if (shouldSave) {
		saveDatabaseToLocalStorage()
	}
	updateAllCounts()
}

function updateMealCard(card, category, name, ingredients, recipe, gotowiecData = null) {
	const safeName = (name || 'Bez nazwy').toString()
	card.setAttribute('data-name', safeName)
	card.setAttribute('data-category', category)

	if (category === 'gotowiec') {
		const dataStr = typeof gotowiecData === 'string' ? gotowiecData : JSON.stringify(gotowiecData || {})
		card.setAttribute('data-gotowiec-data', dataStr)
		const parsedData = typeof gotowiecData === 'string' ? JSON.parse(gotowiecData) : gotowiecData || {}

		let previewHtml =
			'<div class="sub-meals-grid" style="display: flex; flex-direction: column; gap: 12px; margin-top: 12px;">'

		const labels = {
			breakfast: '☀️ Śniadanie',
			snack: '🍏 Przekąska',
			lunch: '🍲 Obiad',
			dinner: '🌙 Kolacja',
		}

		for (let key in labels) {
			if (parsedData[key] && parsedData[key].name) {
				const subMeal = parsedData[key]
				const subName = (subMeal.name || '').toString()
				const subIng = (subMeal.ingredients || '').toString()
				const subRec = (subMeal.recipe || '').toString()

				previewHtml += `
    <div class="meal-card sub-card" data-sub-key="${key}">
        <div class="meal-info-container">
            <small style="color: #7f8c8d; font-weight: bold; text-transform: uppercase; font-size: 0.75em; align-self: center;">${labels[key]}</small>
            <strong class="card-title" style="display: block; color: #2c3e50; font-size: 1em; margin-top: 2px;">
                ${subName}
            </strong>
        </div>
        <div class="card-actions" style="margin-top: 8px; display: flex; gap: 5px; flex-wrap: wrap; justify-content: center;">
            <button onclick="openMealModal('${subName.replace(/'/g, "\\'")}', '${subIng.replace(/'/g, "\\'")}', '${subRec.replace(/'/g, "\\'")}')" style="font-size: 0.85em; padding: 4px 8px;">
                Dodaj +
            </button>
            <button class="btn-preview" onclick="toggleSubPreview(this)" style="font-size: 0.85em; padding: 4px 8px;">Podgląd</button>
            <button onclick="editSubMeal(this)" style="background: #f39c12; font-size: 0.85em; padding: 4px 8px;">Edytuj</button>
            <button onclick="deleteSubMeal(this)" style="background: #e74c3c; font-size: 0.85em; padding: 4px 8px;">Usuń</button>
        </div>
        
        <div class="ingredients-preview">
            <div class="preview-section">
                <strong>Składniki:</strong><br>
                <small style="line-height: 1.4;">${subIng || 'Brak składników'}</small>
            </div>
            ${
							subRec
								? `
            <div class="preview-section" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
                <strong>Przepis:</strong><br>
                <small style="line-height: 1.4; white-space: pre-wrap;">${subRec}</small>
            </div>`
								: ''
						}
        </div>
    </div>
`
			}
		}
		previewHtml += '</div>'

		// TUTAJ: Zamieniona kolejność - przyciski główne lądują nad spisem potraw
		card.innerHTML = `
            <div class="meal-info-container">
                <strong class="card-title" style="display: block; color: #2c3e50; font-size: 1.1em;">
                    ${safeName}
                </strong>
            </div>
            
            <div class="card-actions" style="margin-top: 8px; margin-bottom: 8px;">
                <button onclick="openGotowiecModal('${safeName.replace(/'/g, "\\'")}', this.closest('.meal-card'))">
                    Dodaj Cały Zestaw +
                </button>
                <button onclick="openEditGotowiecNameModal(this.closest('.meal-card'))" style="background: #f39c12;">Edytuj Nazwę</button>
                <button onclick="deleteMeal(this.parentElement.parentElement)" style="background: #e74c3c;">Usuń Zestaw</button>
            </div>

            ${previewHtml}
        `
	} else {
		const safeIngredients = (ingredients || '').toString()
		const safeRecipe = (recipe || '').toString()
		card.setAttribute('data-ingredients', safeIngredients)
		card.setAttribute('data-recipe', safeRecipe)

		card.innerHTML = `
            <div class="meal-info-container">
                <strong class="card-title" style="display: block; color: #2c3e50; font-size: 1.1em;">
                    ${safeName}
                </strong>
            </div>
            <div class="card-actions">
                <button onclick="openMealModal('${safeName.replace(/'/g, "\\'")}', '${safeIngredients.replace(/'/g, "\\'")}', '${safeRecipe.replace(/'/g, "\\'")}')">
                    Dodaj +
                </button>
                <button class="btn-preview" onclick="togglePreview(this)">Podgląd</button>
                <button onclick="editMeal(this.parentElement.parentElement)" style="background: #f39c12;">Edytuj</button>
                <button onclick="deleteMeal(this.parentElement.parentElement)" style="background: #e74c3c;">Usuń</button>
            </div>
            <div class="ingredients-preview">
                <div class="preview-section">
                    <strong>Składniki:</strong><br>
                    <small style="line-height: 1.4;">${safeIngredients}</small>
                </div>
                ${
									safeRecipe
										? `<div class="preview-section" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
                    <strong>Przepis:</strong><br>
                    <small style="line-height: 1.4; white-space: pre-wrap;">${safeRecipe}</small>
                </div>`
										: ''
								}
            </div>
        `

		const safeCat = category.replace('ą', 'a')
		const targetAccordion = document.getElementById(`db-${safeCat}`)
		if (targetAccordion) {
			const content = targetAccordion.querySelector('.category-content')
			if (card.parentElement !== content) content.appendChild(card)
			updateAllCounts()
		}
	}
}

// 1. Podgląd pojedynczego dania wewnątrz zestawu (sub-card)
function toggleSubPreview(button) {
	const subCard = button.closest('.sub-card')
	const preview = subCard.querySelector('.ingredients-preview')

	if (preview) {
		const isActive = preview.classList.toggle('active')
		button.innerText = isActive ? 'Ukryj' : 'Podgląd'
	}
}

// 2. Usunięcie pojedynczego dania z zestawu
async function deleteSubMeal(button) {
	if (!confirm('Czy na pewno chcesz usunąć to danie z tego zestawu jednodniowego?')) return

	const parentGotowiecCard = button.closest('.meal-card:not(.sub-card)')
	const subCard = button.closest('.sub-card')

	const gotowiecName = parentGotowiecCard.getAttribute('data-name')
	const subKey = subCard.getAttribute('data-sub-key') // np. 'breakfast'

	try {
		// Znajdź ten zestaw w Firebase po nazwie nadrzędnej
		const snapshot = await db.ref('mealDatabase').orderByChild('name').equalTo(gotowiecName).once('value')
		const data = snapshot.val()

		if (data) {
			const firebaseKey = Object.keys(data)[0]
			// Usuń tylko to konkretne pod-danie w bazie danych
			await db.ref(`mealDatabase/${firebaseKey}/gotowiecData/${subKey}`).remove()
			alert('Danie zostało usunięte z zestawu!')
		}
	} catch (error) {
		console.error('Błąd podczas usuwania pod-dania:', error)
		alert('Nie udało się zapisać zmian w bazie.')
	}
}

function openEditGotowiecNameModal(card) {
	const currentName = card.getAttribute('data-name') // Pobiera czystą nazwę z Firebase
	const modalOverlay = document.getElementById('modalOverlay')
	const dbForm = document.getElementById('addToDatabaseForm')
	const nameInput = document.getElementById('mealNameInput')
	const categorySelect = document.getElementById('db-category-select')

	if (!modalOverlay || !dbForm || !nameInput) return

	// 1. Wpisz czystą nazwę do inputa
	nameInput.value = currentName
	nameInput.placeholder = 'Wpisz nową nazwę zestawu...'

	// 2. Ukryj wybór kategorii oraz jej etykietę (label)
	if (categorySelect) {
		categorySelect.style.display = 'none'
		const label = categorySelect.closest('label') || categorySelect.previousElementSibling
		if (label && (label.tagName === 'LABEL' || label.classList.contains('form-group'))) {
			label.style.display = 'none'
		}
	}

	// 3. Ukryj sekcje składników i pod-dań
	const singleFields = document.getElementById('singleMealFields')
	const gotowiecFields = document.getElementById('gotowiecFields')
	if (singleFields) singleFields.style.display = 'none'
	if (gotowiecFields) gotowiecFields.style.display = 'none'

	// 4. Ustaw flagi edycji nazwy na formularzu
	dbForm.setAttribute('data-mode', 'edit-gotowiec-name')
	dbForm.setAttribute('data-old-name', currentName)

	// 5. Otwórz modal
	modalOverlay.style.display = 'flex'
}

// 3. Szybka edycja pojedynczego dania bezpośrednio w zestawie
async function editSubMeal(button) {
	const parentGotowiecCard = button.closest('.meal-card:not(.sub-card)')
	const subCard = button.closest('.sub-card')

	const gotowiecName = parentGotowiecCard.getAttribute('data-name')
	const subKey = subCard.getAttribute('data-sub-key') // np. 'breakfast'

	// Pobieramy aktualne dane tego pod-dania z atrybutu nadrzędnego
	const dataStr = parentGotowiecCard.getAttribute('data-gotowiec-data')
	const parsedData = JSON.parse(dataStr || '{}')
	const currentSubMeal = parsedData[subKey] || {}

	// DOPASOWANE ID: Celujemy dokładnie w Twoje elementy z HTML
	const modalOverlay = document.getElementById('modalOverlay')
	const dbForm = document.getElementById('addToDatabaseForm')
	const nameInput = document.getElementById('mealNameInput')
	const ingredientsInput = document.getElementById('ingredientsInput')
	const recipeInput = document.getElementById('recipeInput')

	if (!modalOverlay || !dbForm || !ingredientsInput || !recipeInput) {
		console.error('Nie znaleziono elementów modalu w DOM. Sprawdź ich ID.')
		return
	}

	// 1. Wypełniamy pola modalu danymi pod-dania
	if (nameInput) nameInput.value = currentSubMeal.name || ''
	ingredientsInput.value = currentSubMeal.ingredients || ''
	recipeInput.value = currentSubMeal.recipe || ''

	// 2. Przełączamy widoki wewnątrz modalu (chcemy widzieć tylko pola pojedynczego dania)
	const singleFields = document.getElementById('singleMealFields')
	const gotowiecFields = document.getElementById('gotowiecFields')
	if (singleFields) singleFields.style.display = 'flex'
	if (gotowiecFields) gotowiecFields.style.display = 'none'

	// 3. Ustawiamy flagi bezpośrednio na FORMULARZU zamiast na przycisku
	dbForm.setAttribute('data-mode', 'edit-sub-meal')
	dbForm.setAttribute('data-parent-name', gotowiecName)
	dbForm.setAttribute('data-sub-key', subKey)

	// 4. Otwieramy modal
	modalOverlay.style.display = 'flex'
}

async function saveSubMealFromModal(parentName, subKey, newName, newIngredients, newRecipe) {
	try {
		const snapshot = await db.ref('mealDatabase').orderByChild('name').equalTo(parentName).once('value')
		const data = snapshot.val()

		if (data) {
			const firebaseKey = Object.keys(data)[0]
			const updatedSubObject = {
				name: newName || 'Nieokreślone',
				ingredients: newIngredients,
				recipe: newRecipe,
			}

			// Nadpisujemy dokładnie to jedno pod-danie wewnątrz struktury gotowca
			await db.ref(`mealDatabase/${firebaseKey}/gotowiecData/${subKey}`).set(updatedSubObject)

			// Czyszczenie flag z przycisku, żeby nie psuć kolejnych akcji
			const saveBtn = document.getElementById('save-meal-btn')
			if (saveBtn) {
				saveBtn.removeAttribute('data-mode')
				saveBtn.removeAttribute('data-parent-name')
				saveBtn.removeAttribute('data-sub-key')
			}

			// Czyszczenie pól i zamykanie okna (tak jak przy zwykłym dodawaniu)
			document.getElementById('addToDatabaseForm').reset()
			document.getElementById('modalOverlay').style.display = 'none'
			toggleFormFields()

			alert('Danie w zestawie zostało pomyślnie zaktualizowane!')
		}
	} catch (error) {
		console.error('Błąd podczas zapisu zaktualizowanego sub-dania:', error)
		alert('Wystąpił błąd podczas zapisu zmian do bazy danych.')
	}
}

// --- LOGIKA TABELI ---

// Zmienne pomocnicze do przechowywania danych aktualnie wybranego posiłku
let currentMealData = null // Tu ląduje danie "w zawieszeniu"

// Obsługa wrzucania zestawu do planu
function openGotowiecModal(name, elementOrData) {
	let gotowiecData = {}

	// Bezpieczne wyciąganie danych niezależnie od tego, czy przekazano obiekt, string czy element DOM
	if (typeof elementOrData === 'string') {
		gotowiecData = JSON.parse(elementOrData)
	} else if (elementOrData && typeof elementOrData.getAttribute === 'function') {
		// 1. Najpierw sprawdź, czy sam przycisk ma dane (tak będzie w pickerze)
		let dataStr = elementOrData.getAttribute('data-gotowiec-data')
		// 2. Jeśli nie ma, poszukaj nadrzędnej karty .meal-card (tak jest na głównej liście)
		if (!dataStr) {
			const card = elementOrData.closest('.meal-card')
			if (card) dataStr = card.getAttribute('data-gotowiec-data')
		}
		gotowiecData = JSON.parse(dataStr || '{}')
	} else if (elementOrData && typeof elementOrData === 'object') {
		gotowiecData = elementOrData
	}

	currentMealData = {
		category: 'gotowiec',
		name: name,
		gotowiecData: gotowiecData,
	}

	const modalTitle = document.querySelector('#meal-modal h3')
	if (modalTitle) modalTitle.innerText = `Dodaj zestaw: ${name}`

	const mealModal = document.getElementById('meal-modal')
	if (!mealModal) return

	const innerCatSelect = mealModal.querySelectorAll('select')[1]
	const innerCatLabel = mealModal.querySelectorAll('label')[1]

	if (innerCatSelect) innerCatSelect.style.display = 'none'
	if (innerCatLabel) innerCatLabel.style.display = 'none'

	// === BONUS: Automatyczne ustawianie dnia w modalu ===
	const daySelect = document.getElementById('modal-day-select')
	if (daySelect && window.clickedTableDayIndex !== undefined) {
		daySelect.value = window.clickedTableDayIndex
	}
	// =====================================================

	mealModal.style.display = 'flex'
}

function openMealModal(name, ingredients, recipe) {
	currentMealData = {
		name: name,
		ingredients: ingredients,
		recipe: recipe || '',
	}

	const modalTitle = document.querySelector('#meal-modal h3')
	if (modalTitle) modalTitle.innerText = `Dodaj: ${name}`

	const mealModal = document.getElementById('meal-modal')
	const innerCatSelect = mealModal.querySelectorAll('select')[1]
	const innerCatLabel = mealModal.querySelectorAll('label')[1]

	if (innerCatSelect) innerCatSelect.style.display = 'block'
	if (innerCatLabel) innerCatLabel.style.display = 'block'

	const daySelect = document.getElementById('modal-day-select')
	if (daySelect && window.clickedTableDayIndex !== undefined) {
		daySelect.value = window.clickedTableDayIndex
	}

	document.getElementById('meal-modal').style.display = 'flex'
}

function handleModalSave(event) {
	if (event) event.preventDefault()
	const modal = document.getElementById('meal-modal')
	const daySelect = modal.querySelector('#modal-day-select')
	const dayIndex = parseInt(daySelect.value)

	if (!currentMealData) return

	// Scenariusz 1: Obsługa zestawu "gotowiec"
	if (currentMealData.category === 'gotowiec') {
		const data = currentMealData.gotowiecData

		const mapping = [
			{ cat: 'śniadanie', key: 'breakfast' },
			{ cat: 'przekąska', key: 'snack' },
			{ cat: 'obiad', key: 'lunch' },
			{ cat: 'kolacja', key: 'dinner' },
		]

		mapping.forEach(item => {
			const mealInfo = data[item.key]
			if (mealInfo && mealInfo.name) {
				const row = document.querySelector(`#mealTable tr[data-category="${item.cat}"]`)
				if (row) {
					// Usunięte grupowanie dni dla obiadu – teraz każdy posiłek leci wprost pod dayIndex
					const cell = row.cells[dayIndex]
					if (cell) {
						fillTableCell(cell, mealInfo.name, mealInfo.ingredients, mealInfo.recipe)
					}
				}
			}
		})

		if (typeof saveTableToLocalStorage === 'function') saveTableToLocalStorage()
		closeModalBnt()
	}
	// Scenariusz 2: Obsługa pojedynczego dania
	else {
		const categorySelect = modal.querySelectorAll('select')[1]
		const selectedCategory = categorySelect.value
		const row = document.querySelector(`#mealTable tr[data-category="${selectedCategory}"]`)

		if (!row) return

		// Usunięte grupowanie dni dla obiadu – pełna unifikacja dla wszystkich kategorii
		const cell = row.cells[dayIndex]

		if (cell) {
			fillTableCell(cell, currentMealData.name, currentMealData.ingredients, currentMealData.recipe)
			if (typeof saveTableToLocalStorage === 'function') saveTableToLocalStorage()
			closeModalBnt()
		}
	}
}

function closeModalBnt() {
	const modal = document.getElementById('meal-modal')
	if (modal) {
		modal.style.display = 'none' // Ukrywa overlay
	}
	currentMealData = null // Czyści dane "w pamięci"
}

function fillTableCell(cell, name, ingredients, recipe = '') {
	cell.style.position = 'relative'
	cell.style.verticalAlign = 'center'
	cell.style.padding = '23px 5px 5px 5px'

	// Zabezpieczenie przed wartościami undefined/null oraz cudzysłowami
	const safeIng = (ingredients || '').replace(/"/g, '&quot;')
	const safeRec = (recipe || '').replace(/"/g, '&quot;')

	cell.innerHTML = `
        <div class="meal-container" data-ingredients="${safeIng}" data-recipe="${safeRec}">
            <button class="info-btn table-btn" onclick="showMealInfo(this)">i</button>
            <button class="delete-btn table-btn" onclick="clearCell(this)">&times;</button>
            <div class="meal-name-text">${name}</div>
        </div>
    `
}

function showMealInfo(btn) {
	const container = btn.closest('.meal-container')
	const name = container.querySelector('.meal-name-text').innerText

	// Kluczowe: pobieramy ZAWSZE najświeższe atrybuty z kontenera
	const ingredients = container.getAttribute('data-ingredients') || ''
	const recipe = container.getAttribute('data-recipe') || ''

	const modal = document.getElementById('infoModal')
	const title = document.getElementById('infoModalTitle')
	const content = document.getElementById('infoModalContent')

	title.innerText = name

	const ingredientsList = ingredients
		.split(',')
		.filter(item => item.trim() !== '')
		.map(item => `• ${item.trim()}`)
		.join('<br>')

	let modalHTML = `<div style="text-align: left; padding: 10px;">`
	modalHTML += `<div style="margin-bottom: 15px;"><strong>Składniki:</strong><br>${ingredientsList || 'Brak składników'}</div>`
	modalHTML += `<div><strong>Przepis:</strong><br><div style="white-space: pre-wrap; margin-top: 5px; font-size: 0.9em;">${recipe || 'Brak przepisu'}</div></div>`
	modalHTML += `</div>`

	content.innerHTML = modalHTML
	modal.style.display = 'flex'
}

function closeInfoModal() {
	document.getElementById('infoModal').style.display = 'none'
}

function setEmptyCell(cell) {
	cell.style.position = 'relative'
	cell.innerHTML = `<button class="add-btn table-btn" onclick="openMealPicker(this)">+</button>`
}

// Osobna funkcja do czyszczenia, aby kod w HTML był czystszy
function clearCell(btn) {
	const cell = btn.closest('td')
	setEmptyCell(cell)
	saveTableToLocalStorage()
}

// --- MODAL FORMULARZA ---

// Funkcja przełączająca widok pól formularza (wywoływana przy zmianie selecta)
function toggleFormFields() {
	const categorySelect = document.getElementById('db-category-select')
	const singleMealFields = document.getElementById('singleMealFields')
	const gotowiecFields = document.getElementById('gotowiecFields')
	const nameInput = document.getElementById('mealNameInput')

	// Zabezpieczenie na wypadek, gdyby elementy jeszcze nie istniały w DOM
	if (!categorySelect || !singleMealFields || !gotowiecFields) return

	// Przywracanie widoczności selektora kategorii po edycji nazwy
	categorySelect.style.display = 'block'
	const label = categorySelect.closest('label') || categorySelect.previousElementSibling
	if (label && (label.tagName === 'LABEL' || label.classList.contains('form-group'))) {
		label.style.display = 'block'
	}

	if (categorySelect.value === 'gotowiec') {
		// Ukryj pojedyncze danie, pokaż gotowca
		singleMealFields.style.display = 'none'
		gotowiecFields.style.display = 'flex'

		// Dynamiczna walidacja: w zestawie główna nazwa to np. "Zestaw 2000kcal"
		document.getElementById('mealNameInput').placeholder = 'Wpisz nazwę zestawu (np. Dzień 1)...'
	} else {
		// Pokaż pojedyncze danie, ukryj gotowca
		singleMealFields.style.display = 'flex'
		gotowiecFields.style.display = 'none'

		document.getElementById('mealNameInput').placeholder = 'Wpisz nazwę...'
	}
}

openBtn.onclick = () => {
	editingCard = null
	modal.style.display = 'flex'
	document.getElementById('modal-category-select').value = 'śniadanie'
	toggleFormFields()
}

cancelBtn.onclick = () => {
	modal.style.display = 'none'
	mealForm.reset()
}

function closeModal() {
	modal.style.display = 'none'
	mealForm.reset()
	document.getElementById('modal-category-select').value = 'śniadanie'
	toggleFormFields()
	editingCard = null
	const saveBtn = document.getElementById('save-meal-btn')
	if (saveBtn) saveBtn.removeAttribute('data-mode')
}

function editMeal(card) {
	if (!card) return

	// 1. Pobranie aktualnych danych z atrybutów HTML karty dania
	const currentName = card.getAttribute('data-name') || ''
	const currentCategory = card.getAttribute('data-category') || ''
	const currentIngredients = card.getAttribute('data-ingredients') || ''
	const currentRecipe = card.getAttribute('data-recipe') || ''

	// 2. Pobranie wszystkich potrzebnych elementów modalu z DOM
	const modalOverlay = document.getElementById('modalOverlay')
	const dbForm = document.getElementById('addToDatabaseForm')
	const nameInput = document.getElementById('mealNameInput')
	const categorySelect = document.getElementById('db-category-select')
	const ingredientsInput = document.getElementById('ingredientsInput')
	const recipeInput = document.getElementById('recipeInput')

	// Walidacja bezpieczeństwa – upewniamy się, że struktura modalu istnieje
	if (!modalOverlay || !dbForm || !nameInput || !categorySelect) {
		console.error('Błąd: Nie znaleziono kluczowych elementów modalu w DOM. Sprawdź ID w HTML.')
		return
	}

	// 3. Wstrzyknięcie dotychczasowych danych dania do pól formularza
	nameInput.value = currentName
	categorySelect.value = currentCategory

	if (ingredientsInput) ingredientsInput.value = currentIngredients
	if (recipeInput) recipeInput.value = currentRecipe

	// 4. Przywrócenie widoczności selecta kategorii i jego labela
	// (na wypadek, gdyby funkcja openEditGotowiecNameModal je wcześniej ukryła)
	categorySelect.style.display = 'block'
	const label = categorySelect.closest('label') || categorySelect.previousElementSibling
	if (label && (label.tagName === 'LABEL' || label.classList.contains('form-group'))) {
		label.style.display = 'block'
	}

	// 5. Odświeżenie widoczności pól (pokaże pola tekstowe, ukryje sekcje gotowca)
	toggleFormFields()

	// 6. Ustawienie kluczowych flag edycji na FORMULARZU
	// Dzięki temu handleDatabaseFormSubmit wie, że ma zaktualizować istniejący wpis zamiast robić .push()
	dbForm.setAttribute('data-mode', 'edit-meal')
	dbForm.setAttribute('data-old-name', currentName)

	// 7. Wyświetlenie modalu użytkownikowi
	modalOverlay.style.display = 'flex'
}

function deleteMeal(card) {
	const mealName = card.querySelector('.card-title')?.innerText

	// Sprawdzamy, czy usuwana karta to gotowiec i wyciągamy nazwy wszystkich jego potraw składowych
	const gotowiecDataStr = card.getAttribute('data-gotowiec-data')
	let subMealNames = []

	if (gotowiecDataStr) {
		try {
			const gotowiecData = JSON.parse(gotowiecDataStr)
			subMealNames = Object.values(gotowiecData)
				.map(sm => sm.name)
				.filter(Boolean)
		} catch (e) {
			console.error('Błąd parsowania danych gotowca przy usuwaniu:', e)
		}
	}

	if (confirm(`Czy na pewno usunąć "${mealName}" z bazy? Zostanie ono również usunięte z aktualnego jadłospisu.`)) {
		// 1. Usuwamy kartę z widoku bazy
		card.remove()

		// 2. Szukamy potraw w tabeli jadłospisu i je czyścimy
		const allPlannedMeals = document.querySelectorAll('.meal-container')
		allPlannedMeals.forEach(container => {
			const plannedName = container.querySelector('.meal-name-text')?.innerText

			// WARUNEK: Czyść, jeśli nazwa w tabeli to nazwa dania, nazwa zestawu
			// LUB jeśli znajduje się na liście dań składowych usuwanego zestawu
			if (plannedName === mealName || subMealNames.includes(plannedName)) {
				const cell = container.closest('td')
				if (cell) {
					setEmptyCell(cell)
				}
			}
		})

		// 3. Zapisujemy zmiany
		if (typeof saveDatabaseToLocalStorage === 'function') saveDatabaseToLocalStorage()
		if (typeof saveTableToLocalStorage === 'function') saveTableToLocalStorage()
		if (typeof updateAllCounts === 'function') updateAllCounts()
	}
}

// 2. Podgląd zwykłego, pojedynczego posiłku z bazy danych
function togglePreview(button) {
	const card = button.closest('.meal-card')
	const preview = card.querySelector('.ingredients-preview')

	if (preview) {
		const isActive = preview.classList.toggle('active')
		button.innerText = isActive ? 'Ukryj' : 'Podgląd'
	}
}

let currentTargetCell = null // Zmienna pomocnicza, by wiedzieć gdzie dodać danie

// 1. Zmodyfikuj funkcję generowania/czyszczenia komórki, by zawsze był tam "+"
function setEmptyCell(cell) {
	cell.style.position = 'relative'
	cell.innerHTML = `
        <button class="add-btn table-btn" onclick="openMealPicker(this)">+</button>
    `
}

// 2. Otwieranie okna z listą dań
function openMealPicker(btn) {
	currentTargetCell = btn.closest('td')
	const modalPicker = document.getElementById('mealPickerModal')
	const listContainer = document.getElementById('modalMealsList')
	const searchInput = document.getElementById('modalSearchInput')

	const savedDatabase = globalMealDatabase

	const td = btn.closest('td')
	const row = btn.closest('tr')
	if (td && row) {
		const category = row.getAttribute('data-category')
		let dayIndex = td.cellIndex // Pobiera numer kolumny (1-7)

		window.clickedTableDayIndex = dayIndex // Zapisujemy globalnie
	}

	// 1. Tworzymy pasek filtrów (jeśli jeszcze go nie ma)
	let filterBar = document.getElementById('modalFilterBar')
	if (!filterBar) {
		filterBar = document.createElement('div')
		filterBar.id = 'modalFilterBar'
		filterBar.style.cssText = 'display:flex; gap:5px; margin-bottom:15px; flex-wrap:wrap; justify-content:center;'
		searchInput.parentNode.insertBefore(filterBar, searchInput.nextSibling)
	}

	// 2. Funkcja renderująca listę
	const renderList = (filterText = '', activeCat = '') => {
		listContainer.innerHTML = ''

		const cats = ['śniadanie', 'obiad', 'kolacja', 'przekąska', 'gotowiec', 'wszystkie']
		filterBar.innerHTML = ''

		cats.forEach(c => {
			const isAll = c === 'wszystkie'
			const isActive = (isAll && activeCat === '') || activeCat === c

			const b = document.createElement('button')
			b.innerText = c.toUpperCase()
			b.style.cssText = `padding:5px 12px; font-size:10px; cursor:pointer; border-radius:15px; border:1px solid #ddd; 
                               transition: all 0.2s; background:${isActive ? '#4caf50' : '#fff'}; color:${isActive ? '#fff' : '#333'}`
			b.onclick = () => renderList(searchInput.value, isAll ? '' : c)
			filterBar.appendChild(b)
		})

		const filtered = savedDatabase.filter(m => {
			const matchesSearch = m.name.toLowerCase().includes(filterText.toLowerCase())
			const matchesCat = activeCat === '' || m.category === activeCat
			return matchesSearch && matchesCat
		})

		if (filtered.length === 0) {
			listContainer.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">Brak pasujących dań.</p>'
			return
		}

		filtered.forEach(meal => {
			const item = document.createElement('div')
			item.className = 'meal-picker-item'
			item.innerHTML = `
                <span><strong>${meal.name}</strong></span>
                <small style="background:#eee; padding:2px 6px; border-radius:4px; font-size:10px;">${meal.category}</small>
            `
			item.onclick = () => {
				if (meal.category === 'gotowiec') {
					// POPRAWKA: Zamiast zawodnego cellId, bierzemy gotowy, przeliczony wyżej indeks dnia
					const dayNum = window.clickedTableDayIndex

					if (dayNum !== undefined && !isNaN(dayNum)) {
						const data = meal.gotowiecData || {}

						// POPRAWKA: Angielskie klucze, dokładnie takie same jak w Firebase
						const mapping = [
							{ cat: 'śniadanie', key: 'breakfast' },
							{ cat: 'przekąska', key: 'snack' },
							{ cat: 'obiad', key: 'lunch' },
							{ cat: 'kolacja', key: 'dinner' },
						]

						mapping.forEach(mItem => {
							const mealInfo = data[mItem.key]
							if (mealInfo && mealInfo.name) {
								const row = document.querySelector(`#mealTable tr[data-category="${mItem.cat}"]`)
								if (row) {
									cell = row.cells[dayNum]
								}
								if (cell) {
									fillTableCell(cell, mealInfo.name, mealInfo.ingredients, mealInfo.recipe)
								}
							}
						})
						saveTableToLocalStorage()
					}
				} else {
					// Standardowe pojedyncze danie
					const mealRecipe = meal.recipe || ''
					fillTableCell(currentTargetCell, meal.name, meal.ingredients, mealRecipe)
					saveTableToLocalStorage()
				}
				closeMealPicker()
			}
			listContainer.appendChild(item)
		})
	}

	searchInput.value = ''
	searchInput.oninput = e => {
		const activeBtn = Array.from(filterBar.querySelectorAll('button')).find(
			b => b.style.backgroundColor === 'rgb(76, 175, 80)',
		)
		const currentCat = activeBtn && activeBtn.innerText !== 'WSZYSTKIE' ? activeBtn.innerText.toLowerCase() : ''
		renderList(e.target.value, currentCat)
	}

	renderList('', '')
	modalPicker.style.display = 'flex'
}

function closeMealPicker() {
	document.getElementById('mealPickerModal').style.display = 'none'
}

// --- GENEROWANIE LISTY ZAKUPÓW ---

document.addEventListener('DOMContentLoaded', () => {
	const generateListBtn = document.getElementById('generateListBtn')
	const shoppingContainer = document.getElementById('shoppingListContainer')
	const shoppingSection = document.getElementById('shoppingListSection')

	// =========================================================================
	// MIEJSCE NA TWOJĄ KONFIGURACJĘ KOLEJNOŚCI I KATEGORII W PRZYSZŁOŚCI
	// =========================================================================

	// 1. Tutaj ustalasz kolejność wyświetlania kategorii od góry do dołu.
	// Wszystko, czego nie wpiszesz do słownika poniżej, automatycznie wpadnie do "inne".
	const CATEGORY_ORDER = ['warzywa', 'owoce', 'nabiał', 'mięso', 'inne']

	// 2. Słownik słów kluczowych. Wpisuj nazwy składników małymi literami.
	// System sprawdza zawieranie tekstu, więc "pomidor" dopasuje też "pomidory malinowe".
	const INGREDIENT_TO_CATEGORY = {
		// Warzywa
		pomidor: 'warzywa',
		ogórek: 'warzywa',
		cebula: 'warzywa',
		czosnek: 'warzywa',
		marchew: 'warzywa',
		ziemniak: 'warzywa',
		sałata: 'warzywa',
		szpinak: 'warzywa',
		papryka: 'warzywa',
		cukinia: 'warzywa',
		rzodkiewka: 'warzywa',
		seler: 'warzywa',

		// Owoce
		jabłko: 'owoce',
		banan: 'owoce',
		cytryna: 'owoce',
		truskawk: 'owoce',
		borówk: 'owoce',
		awokado: 'owoce',
		mango: 'owoce',

		// Nabiał (Przykłady na przyszłość)
		mleko: 'nabiał',
		ser: 'nabiał',
		twaróg: 'nabiał',
		jaj: 'nabiał',

		// Mięso (Przykłady na przyszłość)
		kurczak: 'mięso',
		pierś: 'mięso',
		mielone: 'mięso',
	}

	// Funkcja pomocnicza przypisująca kategorię do produktu
	function getItemCategory(name) {
		const lowerName = name.toLowerCase().trim()

		// Przeszukujemy słownik słów kluczowych
		for (const [keyword, category] of Object.entries(INGREDIENT_TO_CATEGORY)) {
			if (lowerName.includes(keyword)) {
				return category
			}
		}
		return 'inne' // Domyślna kategoria, jeśli produkt nie pasuje do żadnego słowa kluczowego
	}

	// =========================================================================

	// --- FUNKCJA ODMIANY ---
	function getPolishForm(n, s1, s2, s3) {
		if (n === 1) return s1
		const n10 = n % 10
		const n100 = n % 100
		if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return s2
		return s3
	}

	// --- PARSER ---
	function parseIngredient(itemStr) {
		const match = itemStr.match(/^(.*?)\s*(\d+[\.,]?\d*)\s*(g|ml|szt\.?|szt)?$/i)

		if (match) {
			const name = match[1].trim()
			const qty = parseFloat(match[2].replace(',', '.'))
			let unit = (match[3] || '').toLowerCase().replace('.', '')

			if (!unit) unit = 'szt'

			const isBread = name.toLowerCase() === 'chleb' && unit === 'szt'

			return { name, qty, unit, isBread }
		}

		return { name: itemStr.trim(), qty: 1, unit: 'szt', isBread: false }
	}

	// --- OBSŁUGA DRAG & DROP ---
	let dragSrcEl = null

	function handleDragStart(e) {
		this.style.opacity = '0.4'
		dragSrcEl = this
		e.dataTransfer.effectAllowed = 'move'
		e.dataTransfer.setData('text/html', this.innerHTML)
	}

	function handleDragOver(e) {
		if (e.preventDefault) e.preventDefault()
		return false
	}

	function handleDragEnter(e) {
		this.classList.add('over')
	}

	function handleDragLeave(e) {
		this.classList.remove('over')
	}

	function handleDrop(e) {
		if (e.stopPropagation) e.stopPropagation()
		if (dragSrcEl !== this) {
			dragSrcEl.innerHTML = this.innerHTML
			this.innerHTML = e.dataTransfer.getData('text/html')
		}
		return false
	}

	function handleDragEnd(e) {
		this.style.opacity = '1'
		const items = document.querySelectorAll('.shopping-item')
		items.forEach(item => item.classList.remove('over'))
	}

	// --- GENEROWANIE LISTY ---
	generateListBtn.onclick = () => {
		const meals = document.querySelectorAll('.meal-container[data-ingredients]')
		const summary = {}

		meals.forEach(meal => {
			let data = meal.getAttribute('data-ingredients')
			if (!data) return
			const items = data
				.replace(/\r?\n/g, ',')
				.split(',')
				.map(i => i.trim())
				.filter(Boolean)

			items.forEach(item => {
				const { qty, unit, isBread, name } = parseIngredient(item)

				const key = isBread ? 'BREAD_TOTAL' : `${name.toLowerCase()}|||${unit}`

				if (!summary[key]) {
					summary[key] = {
						displayName: name,
						qty: 0,
						unit: unit,
						isBread: isBread,
					}
				}
				summary[key].qty += qty
			})
		})

		if (Object.keys(summary).length === 0) {
			shoppingSection.style.display = 'none'
			alert('Twoja lista jest pusta! Dodaj składniki do posiłków, aby wygenerować listę zakupów.')
			return
		}

		const list = []
		Object.keys(summary).forEach(key => {
			const itemData = summary[key]
			let amount = Math.round(itemData.qty * 100) / 100
			let htmlContent = ''
			let sortKey = ''

			if (key === 'BREAD_TOTAL') {
				const totalSlices = Math.round(amount)
				const loaves = Math.floor(totalSlices / 20)
				const remainingSlices = totalSlices % 20

				sortKey = 'chleb'

				if (loaves > 0) {
					const loafWord = getPolishForm(loaves, 'chleb', 'chleby', 'chlebów')
					htmlContent = `${loafWord} <strong>${loaves}</strong>`
					if (remainingSlices > 0) {
						htmlContent += ` + kromki <strong>${remainingSlices}</strong>`
					}
				} else {
					htmlContent = `chleb (kromki) <strong>${remainingSlices}</strong>`
				}
			} else {
				sortKey = itemData.displayName.toLowerCase()

				if (itemData.unit === 'g' && amount >= 1000) {
					const kg = Math.floor(amount / 1000)
					const g = Math.round(amount % 1000)
					const restG = g > 0 ? ` ${g}g` : ''
					htmlContent = `${itemData.displayName} <strong>${kg}kg${restG}</strong>`
				} else if (itemData.unit === 'ml' && amount >= 1000) {
					const l = Math.floor(amount / 1000)
					const ml = Math.round(amount % 1000)
					const restMl = ml > 0 ? ` ${ml}ml` : ''
					htmlContent = `${itemData.displayName} <strong>${l}l${restMl}</strong>`
				} else {
					htmlContent = `${itemData.displayName} <strong>${amount}${itemData.unit}</strong>`
				}
			}

			// Przypisanie kategorii dla danego elementu listy
			const itemCategory = key === 'BREAD_TOTAL' ? getItemCategory('chleb') : getItemCategory(itemData.displayName)

			list.push({
				label: htmlContent,
				sortKey: sortKey,
				category: itemCategory, // Dodane na potrzeby zaawansowanego sortowania
			})
		})

		// --- ZAAWANSOWANE SORTOWANIE (NAJPIERW KATEGORIA, POTEM ALFABETYCZNIE) ---
		shoppingContainer.innerHTML = ''

		list.sort((a, b) => {
			const indexA = CATEGORY_ORDER.indexOf(a.category)
			const indexB = CATEGORY_ORDER.indexOf(b.category)

			// Jeśli kategoria nie została znaleziona w tablicy (błąd zabezpieczenia), ustawiamy ją na koniec
			const weightA = indexA === -1 ? 999 : indexA
			const weightB = indexB === -1 ? 999 : indexB

			if (weightA !== weightB) {
				return weightA - weightB // Sortowanie według kolejności z tablicy CATEGORY_ORDER
			}

			// Jeśli ta sama kategoria – sortuj alfabetycznie po języku polskim
			return a.sortKey.localeCompare(b.sortKey, 'pl')
		})

		list.forEach(item => {
			const el = document.createElement('div')
			el.className = 'shopping-item'
			el.draggable = true
			el.innerHTML = `<input type="checkbox"> <span>${item.label}</span>`

			el.addEventListener('dragstart', handleDragStart)
			el.addEventListener('dragenter', handleDragEnter)
			el.addEventListener('dragover', handleDragOver)
			el.addEventListener('dragleave', handleDragLeave)
			el.addEventListener('drop', handleDrop)
			el.addEventListener('dragend', handleDragEnd)

			shoppingContainer.appendChild(el)
		})

		shoppingSection.style.display = 'block'
	}

	const refreshListBtn = document.getElementById('refreshListBtn')
	if (refreshListBtn) {
		refreshListBtn.onclick = () => {
			generateListBtn.click()
		}
	}
})

function closeShoppingList() {
	const shoppingSection = document.getElementById('shoppingListSection')
	if (shoppingSection) {
		shoppingSection.style.display = 'none'
	}
}

// Funkcje drukowania i pobierania (zostały bez zmian, są poprawne)
// 1. Drukowanie Jadłospisu (Poziomo)
function printJadlospis() {
	const style = document.createElement('style')
	style.innerHTML = `@page { size: landscape; margin: 0.5cm;}` // Dodaj styl poziomy
	document.head.appendChild(style)

	document.body.classList.add('print-jadlospis')
	document.body.classList.remove('print-lista')

	window.print()

	style.remove() // Usuń styl po zamknięciu okna druku
}

// 2. Drukowanie Listy Zakupów (Pionowo)
function printLista() {
	const style = document.createElement('style')
	style.innerHTML = `@page { size: portrait; margin: 1.5cm;}` // Dodaj styl pionowy
	document.head.appendChild(style)

	document.body.classList.add('print-lista')
	document.body.classList.remove('print-jadlospis')

	window.print()

	style.remove() // Usuń styl po zamknięciu okna druku
}

function downloadLista() {
	const items = document.querySelectorAll('.shopping-item')
	if (items.length === 0) return alert('Lista jest pusta!')
	let text = 'LISTA ZAKUPÓW\n' + new Date().toLocaleDateString() + '\n\n'
	items.forEach(item => {
		const qty = item.querySelector('strong').innerText
		const name = item.querySelector('span').innerText
		text += `[ ] ${qty.padEnd(5)} ${name}\n`
	})
	const blob = new Blob([text], { type: 'text/plain' })
	const link = document.createElement('a')
	link.href = URL.createObjectURL(blob)
	link.download = 'Lista_Zakupow.txt'
	link.click()
}

// --- EKSPORT I IMPORT BAZY ---

// 1. Funkcja Eksportu
function exportDatabase() {
	// Pobieramy dane z chmury (zmiennej globalnej), nie z localStorage
	const dataToExport = globalMealDatabase

	if (!dataToExport || dataToExport.length === 0) {
		alert('Twoja baza w chmurze jest pusta. Nie ma czego eksportować!')
		return
	}

	const dataStr = JSON.stringify(dataToExport, null, 2)
	const blob = new Blob([dataStr], { type: 'application/json' })
	const url = URL.createObjectURL(blob)

	const link = document.createElement('a')
	link.href = url
	link.download = `Baza_Posilkow_Firebase_${new Date().toISOString().slice(0, 10)}.json`
	link.click()

	URL.revokeObjectURL(url)
}

// 2. Wyzwalacz dla ukrytego inputu
function triggerImport() {
	document.getElementById('importInput').click()
}

// 3. Ulepszona Funkcja Importu z filtrem duplikatów
function importDatabase(event) {
	const file = event.target.files[0]
	if (!file) return

	const reader = new FileReader()
	reader.onload = async function (e) {
		try {
			const importedData = JSON.parse(e.target.result)

			if (!Array.isArray(importedData)) {
				throw new Error('Nieprawidłowy format pliku. Oczekiwano tablicy [].')
			}

			// Pobieramy aktualny stan z naszej zmiennej globalnej (która ma dane z Firebase)
			const currentDb = globalMealDatabase || []

			// FILTR DUPLIKATÓW: Sprawdzamy po nazwie (trim i małe litery)
			const existingNames = new Set(currentDb.map(m => m.name.toLowerCase().trim()))

			const newMeals = importedData.filter(m => {
				if (!m.name) return false
				const isDuplicate = existingNames.has(m.name.toLowerCase().trim())
				return !isDuplicate
			})

			if (newMeals.length === 0) {
				alert('Wszystkie dania z pliku znajdują się już w Twojej bazie Firebase!')
				event.target.value = ''
				return
			}

			const message =
				`Znaleziono ${importedData.length} posiłków.\n` +
				`- Nowe do dodania: ${newMeals.length}\n` +
				`- Pominięte duplikaty: ${importedData.length - newMeals.length}\n\n` +
				`Czy chcesz wysłać te dane do CHMURY (Firebase)?`

			if (confirm(message)) {
				const finalDb = [...currentDb, ...newMeals]

				// --- KLUCZOWA ZMIANA: Zapisujemy do Firebase zamiast LocalStorage ---
				await db.ref('mealDatabase').set(finalDb)

				updateAllCounts()

				alert('Import zakończony sukcesem! Dane są już w chmurze.')
				// location.reload() nie jest już potrzebne, bo Firebase .on('value')
				// samo odświeży listę na ekranie w ułamku sekundy!
			}
		} catch (err) {
			alert('Błąd podczas importu: ' + err.message)
			console.error(err)
		}
		event.target.value = ''
	}
	reader.readAsText(file)
}

async function shareToKeep() {
	const items = document.querySelectorAll('.shopping-item')
	if (items.length === 0) {
		alert('Lista zakupów jest pusta!')
		return
	}

	// 1. Budujemy tekst listy (czysta lista produktów)
	let text = ''
	items.forEach((item, index) => {
		const qty = item.querySelector('strong').innerText
		const name = item.querySelector('span').innerText

		// Dodajemy nową linię tylko przed kolejnymi produktami (żeby na samym początku nie było pustego wiersza)
		const lineBreak = index === 0 ? '' : '\n'
		text += `${lineBreak}${qty} ${name}`
	})

	const btn = document.querySelector('.btn-share')
	const originalText = btn.innerText

	// 2. Sprawdzamy, czy to urządzenie mobilne (telefon/tablet)
	const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent)

	// 3. Jeśli to Mobile ORAZ wspiera navigator.share
	if (isMobile && navigator.share) {
		try {
			await navigator.share({
				title: 'Lista Zakupów',
				text: text,
			})
		} catch (err) {
			console.log('Anulowano lub błąd udostępniania:', err)
		}
	}
	// 4. Dla komputerów (nawet jeśli wspierają share) lub gdy share zawiedzie
	else {
		try {
			// Kopiowanie do schowka
			await navigator.clipboard.writeText(text)

			// Wizualna zmiana przycisku
			btn.innerText = '✅ SKOPIOWANO!'
			btn.style.backgroundColor = '#2ecc71'

			// Otwieramy Google Keep w nowej karcie
			window.open('https://keep.google.com/', '_blank')

			// Reset przycisku
			setTimeout(() => {
				btn.innerText = originalText
				btn.style.backgroundColor = ''
			}, 2000)
		} catch (err) {
			alert('Wystąpił błąd podczas kopiowania. Spróbuj ręcznie.')
		}
	}
}

// Obsługa animacji zamykania akordeonów
document.querySelectorAll('.category-accordion summary').forEach(summary => {
	summary.addEventListener('click', e => {
		const details = e.target.parentElement
		if (details.open) {
			e.preventDefault()
			details.classList.add('closing')
			setTimeout(() => {
				details.open = false
				details.classList.remove('closing')
			}, 400)
		}
	})
})

const CORRECT_PASSWORD = 'lol'

function checkAppPassword() {
	const input = document.getElementById('app-password-input').value
	const errorMsg = document.getElementById('error-msg')

	if (input === CORRECT_PASSWORD) {
		localStorage.setItem('isAppAuthorized', 'true')
		updateAuthUI(true) // Natychmiastowa aktualizacja interfejsu
	} else {
		errorMsg.style.display = 'block'
		document.getElementById('app-password-input').value = ''
	}
}

function logout() {
	if (confirm('Czy na pewno chcesz wylogować i zablokować stronę?')) {
		localStorage.removeItem('isAppAuthorized')
		updateAuthUI(false) // Natychmiastowa blokada bez czekania na przeładowanie
	}
}

// Funkcja, która steruje wszystkim na raz
function updateAuthUI(isAuthorized) {
	const overlay = document.getElementById('auth-overlay')
	const logoutBtn = document.getElementById('logout-btn')

	if (isAuthorized) {
		if (overlay) overlay.style.display = 'none'
		if (logoutBtn) logoutBtn.style.display = 'inline-block'
	} else {
		if (overlay) {
			// TUTAJ MUSI BYĆ 'flex', żeby środek działał!
			overlay.style.display = 'flex'
			document.getElementById('app-password-input').value = ''
		}
		if (logoutBtn) logoutBtn.style.display = 'none'
	}
}

function toggleSettingsMenu() {
	const menu = document.getElementById('settings-menu')
	const isVisible = menu.style.display === 'flex'
	menu.style.display = isVisible ? 'none' : 'flex'
}

// Zamykanie menu, gdy klikniesz gdzieś indziej na stronie
window.addEventListener('click', e => {
	const menu = document.getElementById('settings-menu')
	const toggleBtn = document.getElementById('settings-toggle')

	if (!menu.contains(e.target) && e.target !== toggleBtn) {
		menu.style.display = 'none'
	}
})

// Zmodyfikuj funkcję updateAuthUI, aby ukrywała też koło zębate przed zalogowaniem
function updateAuthUI(isAuthorized) {
	const overlay = document.getElementById('auth-overlay')
	const settingsToggle = document.getElementById('settings-toggle')

	if (isAuthorized) {
		if (overlay) overlay.style.display = 'none'
		if (settingsToggle) settingsToggle.style.display = 'flex'
	} else {
		if (overlay) overlay.style.display = 'flex'
		if (settingsToggle) settingsToggle.style.display = 'none'
		document.getElementById('settings-menu').style.display = 'none'
	}
}
