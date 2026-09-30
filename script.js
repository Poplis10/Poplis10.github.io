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
			fillTableCell(
				cell,
				data[cell.id].name,
				data[cell.id].ingredients,
				data[cell.id].recipe || '',
				data[cell.id].firebaseKey || '',
				data[cell.id].subKey || '',
			)
		} else {
			cell.innerHTML = `<button class="add-btn table-btn" onclick="openMealPicker(this)">+</button>`
			cell.style.padding = '5px'
		}
	})
})

// 2. ODBIERANIE BAZY DAŃ (TWOICH PRZEPISÓW)
db.ref('mealDatabase').on('value', snapshot => {
	const rawData = snapshot.val() || {}

	let dataArray = Array.isArray(rawData)
		? rawData.map((meal, index) => ({
				...meal,
				firebaseKey: String(index),
			}))
		: Object.entries(rawData).map(([firebaseKey, meal]) => ({
				...meal,
				firebaseKey,
			}))

	// --- SORTOWANIE ALFABETYCZNE ---
	dataArray.sort((a, b) => a.name.localeCompare(b.name, 'pl', { sensitivity: 'base' }))

	globalMealDatabase = dataArray

	// Czyszczenie wszystkich akordeonów przed ponownym renderowaniem
	document.querySelectorAll('.category-content').forEach(c => (c.innerHTML = ''))

	// Renderowanie posortowanych dań
	dataArray.forEach(meal => {
		if (meal.category) {
			createNewMealCard(
				meal.category,
				meal.name,
				meal.ingredients || '',
				meal.recipe || '',
				false,
				meal.gotowiecData || null,
				meal.firebaseKey,
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

		const firebaseKey = container.getAttribute('data-firebase-key')

		let updatedIngredients = null
		let updatedRecipe = null
		let found = false

		// 1. Najpierw szukamy zwykłego dania po firebaseKey
		const updatedMeal = globalMealDatabase.find(m => m.firebaseKey === firebaseKey && m.category !== 'gotowiec')

		if (updatedMeal) {
			updatedIngredients = updatedMeal.ingredients || ''
			updatedRecipe = updatedMeal.recipe || ''
			found = true
		} else {
			// 2. Jeśli nie znaleziono, głębokie przeszukanie pod-dań wewnątrz gotowców
			const firebaseKey = container.getAttribute('data-firebase-key')
			const subKey = container.getAttribute('data-sub-key')

			const parentGotowiec = globalMealDatabase.find(m => m.firebaseKey === firebaseKey && m.category === 'gotowiec')

			if (parentGotowiec?.gotowiecData && subKey) {
				const subMeal = parentGotowiec.gotowiecData[subKey]

				if (subMeal) {
					updatedIngredients = subMeal.ingredients || ''
					updatedRecipe = subMeal.recipe || ''
					found = true
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
		saveWeeklyPlanToFirebase()
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

	const addShoppingItemBtn = document.getElementById('addShoppingItemBtn')

	const addShoppingItemModal = document.getElementById('addShoppingItemModal')

	const cancelShoppingItemBtn = document.getElementById('cancelShoppingItemBtn')

	const confirmShoppingItemBtn = document.getElementById('confirmShoppingItemBtn')

	const newShoppingItemName = document.getElementById('newShoppingItemName')

	addShoppingItemBtn.onclick = () => {
		newShoppingItemName.value = ''
		addShoppingItemModal.style.display = 'flex'
		newShoppingItemName.focus()
	}

	cancelShoppingItemBtn.onclick = () => {
		addShoppingItemModal.style.display = 'none'
	}

	confirmShoppingItemBtn.onclick = async () => {
		const name = newShoppingItemName.value.trim()
		const quantity = parseFloat(newShoppingItemQuantity.value)
		const unit = newShoppingItemUnit.value

		// Walidacja nazwy
		if (!name) {
			alert('Wpisz nazwę produktu.')
			return
		}

		// Walidacja ilości
		if (isNaN(quantity) || quantity <= 0) {
			alert('Wpisz prawidłową ilość.')
			return
		}

		// Nowy produkt
		const newItem = {
			label: `${name} <strong>${quantity}${unit}</strong>`,
			displayName: name,
			quantity: quantity,
			unit: unit,
			sortKey: `extra-${Date.now()}`,
			category: 'inne',
			checked: false,
			additional: true,
		}

		try {
			// Pobranie aktualnej listy z Firebase
			const shoppingListSnapshot = await db.ref('shoppingList').once('value')
			const currentShoppingList = (shoppingListSnapshot.val() || []).filter(Boolean)

			// Dodanie produktu do listy
			currentShoppingList.push(newItem)

			// Zapis całej listy
			await db.ref('shoppingList').set(currentShoppingList)

			// Utworzenie elementu na stronie
			const el = document.createElement('div')
			el.className = 'shopping-item'

			el.innerHTML = `
            <input type="checkbox">

            <span class="shopping-item-name">${name}</span>

            <input
                type="text"
                class="shopping-item-quantity"
                value="${quantity}"
            >

            <span class="shopping-item-unit">${unit}</span>

            <button
                type="button"
                class="delete-shopping-item-btn"
            >&times;</button>
        `

			// --------------------------------
			// CHECKBOX
			// --------------------------------

			const checkbox = el.querySelector('input[type="checkbox"]')

			checkbox.addEventListener('change', async () => {
				try {
					const snapshot = await db.ref('shoppingList').once('value')
					const shoppingList = (snapshot.val() || []).filter(Boolean)

					const firebaseIndex = shoppingList.findIndex(savedItem => savedItem?.sortKey === newItem.sortKey)

					if (firebaseIndex === -1) {
						console.error('Nie znaleziono produktu w Firebase:', newItem.sortKey)
						return
					}

					await db.ref(`shoppingList/${firebaseIndex}/checked`).set(checkbox.checked)

					newItem.checked = checkbox.checked
				} catch (error) {
					console.error('Błąd zapisu statusu produktu:', error)
				}
			})

			// --------------------------------
			// INPUT ILOŚCI
			// --------------------------------

			const quantityInput = el.querySelector('.shopping-item-quantity')

			const resizeQuantityInput = () => {
				quantityInput.style.width = `${Math.max(2, quantityInput.value.length)}ch`
			}

			// Dopasowanie szerokości od razu
			resizeQuantityInput()

			// Dopasowanie szerokości podczas wpisywania
			quantityInput.addEventListener('input', resizeQuantityInput)

			// Zapis ilości po zmianie
			quantityInput.addEventListener('change', async () => {
				// Obsługa przecinka jako separatora dziesiętnego
				const normalizedValue = quantityInput.value.replace(',', '.')

				const newQuantity = parseFloat(normalizedValue)

				// Walidacja
				if (isNaN(newQuantity) || newQuantity <= 0) {
					quantityInput.value = newItem.quantity
					resizeQuantityInput()
					return
				}

				try {
					const snapshot = await db.ref('shoppingList').once('value')

					const shoppingList = (snapshot.val() || []).filter(Boolean)

					const firebaseIndex = shoppingList.findIndex(savedItem => savedItem?.sortKey === newItem.sortKey)

					if (firebaseIndex === -1) {
						console.error('Nie znaleziono produktu:', newItem.sortKey)
						return
					}

					// Aktualizacja ilości w Firebase
					shoppingList[firebaseIndex].quantity = newQuantity

					shoppingList[firebaseIndex].label = `${name} <strong>${newQuantity}${unit}</strong>`

					await db.ref('shoppingList').set(shoppingList)

					// Aktualizacja lokalnego obiektu
					newItem.quantity = newQuantity

					newItem.label = `${name} <strong>${newQuantity}${unit}</strong>`

					resizeQuantityInput()
				} catch (error) {
					console.error('Błąd zapisu ilości produktu:', error)

					// Przywrócenie poprzedniej wartości
					quantityInput.value = newItem.quantity
					resizeQuantityInput()
				}
			})

			// --------------------------------
			// USUWANIE PRODUKTU
			// --------------------------------

			const deleteBtn = el.querySelector('.delete-shopping-item-btn')

			deleteBtn.addEventListener('click', async () => {
				const confirmed = confirm('Czy na pewno chcesz usunąć ten produkt?')

				if (!confirmed) return

				try {
					const snapshot = await db.ref('shoppingList').once('value')

					const shoppingList = (snapshot.val() || []).filter(Boolean)

					const firebaseIndex = shoppingList.findIndex(savedItem => savedItem?.sortKey === newItem.sortKey)

					if (firebaseIndex === -1) {
						console.error('Nie znaleziono produktu do usunięcia:', newItem.sortKey)
						return
					}

					// Usunięcie z tablicy
					shoppingList.splice(firebaseIndex, 1)

					// Zapis do Firebase
					await db.ref('shoppingList').set(shoppingList)

					// Usunięcie z ekranu
					el.remove()
				} catch (error) {
					console.error('Błąd usuwania produktu:', error)
				}
			})

			// Dodanie produktu do listy
			document.getElementById('shoppingListContainer').appendChild(el)

			// Zamknięcie modala
			addShoppingItemModal.style.display = 'none'

			// Wyczyszczenie formularza
			newShoppingItemName.value = ''
			newShoppingItemQuantity.value = ''
		} catch (error) {
			console.error('Błąd dodawania produktu do listy:', error)
			alert('Nie udało się dodać produktu.')
		}
	}
})

// --- LOGOWANIE ---

const CORRECT_PASSWORD = 'lol'

function checkAppPassword() {
	console.log('checkAppPassword uruchomione')

	const input = document.getElementById('app-password-input').value
	console.log('Wpisane hasło:', input)

	const errorMsg = document.getElementById('error-msg')

	if (input === CORRECT_PASSWORD) {
		console.log('HASŁO POPRAWNE')

		localStorage.setItem('isAppAuthorized', 'true')
		updateAuthUI(true)
	} else {
		console.log('HASŁO NIEPOPRAWNE')

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

function updateAuthUI(isAuthorized) {
	const authOverlay = document.getElementById('auth-overlay')
	const logoutBtn = document.getElementById('logoutBtn')
	const settingsBtn = document.getElementById('settingsBtn')

	if (authOverlay) {
		authOverlay.style.display = isAuthorized ? 'none' : 'flex'
	}

	if (logoutBtn) {
		logoutBtn.style.display = isAuthorized ? '' : 'none'
	}

	if (settingsBtn) {
		settingsBtn.style.display = isAuthorized ? '' : 'none'
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

// --- LOGIKA BAZY POSIŁKÓW ---

function createNewMealCard(category, name, ingredients, recipe, shouldSave, gotowiecData = null, firebaseKey = null) {
	const safeCat = category.replace('ą', 'a')

	const accordion = document.getElementById(`db-${safeCat}`)

	if (!accordion) return

	const targetSection = accordion.querySelector('.category-content')

	const mealCard = document.createElement('div')

	mealCard.className = 'meal-card'

	// Generujemy zawartość karty
	updateMealCard(mealCard, category, name, ingredients, recipe, gotowiecData, firebaseKey)

	// Wrzucamy do odpowiedniej sekcji w akordeonie
	targetSection.appendChild(mealCard)

	updateAllCounts()
}

function updateMealCard(card, category, name, ingredients, recipe, gotowiecData = null, firebaseKey = null) {
	if (firebaseKey) {
		card.setAttribute('data-firebase-key', firebaseKey)
	} else {
		card.removeAttribute('data-firebase-key')
	}

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
			snack: '🍏 Drugie śniadanie',
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
	if (!confirm('Czy na pewno chcesz usunąć to danie z tego zestawu jednodniowego?')) {
		return
	}

	const parentGotowiecCard = button.closest('.meal-card:not(.sub-card)')
	const subCard = button.closest('.sub-card')

	const firebaseKey = parentGotowiecCard?.getAttribute('data-firebase-key')
	const subKey = subCard?.getAttribute('data-sub-key')

	const subMealName = subCard?.getAttribute('data-name') || subCard?.querySelector('.card-title')?.innerText || ''

	if (!firebaseKey || !subKey) {
		console.error('Brak firebaseKey lub subKey przy usuwaniu pod-dania.')
		alert('Nie udało się znaleźć dania w bazie.')
		return
	}

	try {
		// 1. Usuń pod-danie z Firebase
		await db.ref(`mealDatabase/${firebaseKey}/gotowiecData/${subKey}`).remove()

		// 2. Usuń to pod-danie z aktualnego jadłospisu
		const allPlannedMeals = document.querySelectorAll('.meal-container')

		allPlannedMeals.forEach(container => {
			const plannedFirebaseKey = container.getAttribute('data-firebase-key') || ''

			const plannedSubKey = container.getAttribute('data-sub-key') || ''

			if (plannedFirebaseKey === firebaseKey && plannedSubKey === subKey) {
				const cell = container.closest('td')

				if (cell) {
					setEmptyCell(cell)
				}
			}
		})

		// 3. Zapisz aktualny weeklyPlan do Firebase
		if (typeof saveWeeklyPlanToFirebase === 'function') {
			await saveWeeklyPlanToFirebase()
		}

		alert('Danie zostało usunięte z zestawu!')
	} catch (error) {
		console.error('Błąd podczas usuwania pod-dania:', error)

		alert('Nie udało się zapisać zmian w bazie.')
	}
}

function openEditGotowiecNameModal(card) {
	const currentName = card.getAttribute('data-name') // Pobiera czystą nazwę z Firebase
	const firebaseKey = card.getAttribute('data-firebase-key')
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
	dbForm.setAttribute('data-firebase-key', firebaseKey || '')

	// 5. Otwórz modal
	modalOverlay.style.display = 'flex'
}

// 3. Szybka edycja pojedynczego dania bezpośrednio w zestawie
async function editSubMeal(button) {
	const parentGotowiecCard = button.closest('.meal-card:not(.sub-card)')
	const subCard = button.closest('.sub-card')

	const firebaseKey = parentGotowiecCard.getAttribute('data-firebase-key')
	const subKey = subCard.getAttribute('data-sub-key')

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
	dbForm.setAttribute('data-parent-firebase-key', firebaseKey)
	dbForm.setAttribute('data-sub-key', subKey)

	// 4. Otwieramy modal
	modalOverlay.style.display = 'flex'
}

async function saveSubMealFromModal(firebaseKey, subKey, newName, newIngredients, newRecipe) {
	try {
		const updatedSubObject = {
			name: newName || 'Nieokreślone',
			ingredients: newIngredients,
			recipe: newRecipe,
		}

		// Aktualizujemy dokładnie jedno pod-danie
		await db.ref(`mealDatabase/${firebaseKey}/gotowiecData/${subKey}`).set(updatedSubObject)

		// Czyszczenie flag z formularza
		const dbForm = document.getElementById('addToDatabaseForm')

		if (dbForm) {
			dbForm.removeAttribute('data-mode')
			dbForm.removeAttribute('data-parent-firebase-key')
			dbForm.removeAttribute('data-parent-name')
			dbForm.removeAttribute('data-sub-key')
		}

		// Czyszczenie pól i zamykanie okna
		if (dbForm) {
			dbForm.reset()
		}

		const modalOverlay = document.getElementById('modalOverlay')

		if (modalOverlay) {
			modalOverlay.style.display = 'none'
		}

		toggleFormFields()

		alert('Danie w zestawie zostało pomyślnie zaktualizowane!')
	} catch (error) {
		console.error('Błąd podczas zapisu zaktualizowanego sub-dania:', error)
		alert('Wystąpił błąd podczas zapisu zmian do bazy danych.')
	}
}

// ============================================================
// OBSŁUGA MODALA, FORMULARZA, BAZY I KART DAŃ
// ============================================================

// ============================================================
// 1. PRZEŁĄCZANIE PÓL FORMULARZA
// ============================================================

function toggleFormFields() {
	const categorySelect = document.getElementById('db-category-select')
	const singleMealFields = document.getElementById('singleMealFields')
	const gotowiecFields = document.getElementById('gotowiecFields')
	const nameInput = document.getElementById('mealNameInput')

	// Zabezpieczenie, jeśli elementów nie ma jeszcze w DOM
	if (!categorySelect || !singleMealFields || !gotowiecFields) {
		return
	}

	// Zawsze przywracamy widoczność selecta kategorii
	categorySelect.style.display = 'block'

	const label = categorySelect.closest('label') || categorySelect.previousElementSibling

	if (label && (label.tagName === 'LABEL' || label.classList.contains('form-group'))) {
		label.style.display = 'block'
	}

	// GOTOWIEC
	if (categorySelect.value === 'gotowiec') {
		singleMealFields.style.display = 'none'
		gotowiecFields.style.display = 'flex'

		if (nameInput) {
			nameInput.placeholder = 'Wpisz nazwę zestawu (np. Dzień 1)...'
		}
	}

	// ZWYKŁE DANIE
	else {
		singleMealFields.style.display = 'flex'
		gotowiecFields.style.display = 'none'

		if (nameInput) {
			nameInput.placeholder = 'Wpisz nazwę (np. Shakshuka)...'
		}
	}
}

// ============================================================
// 2. OTWIERANIE MODALA – NOWE DANIE
// ============================================================

openBtn.onclick = () => {
	editingCard = null

	modal.style.display = 'flex'

	const categorySelect = document.getElementById('db-category-select')

	if (categorySelect) {
		categorySelect.value = 'śniadanie'
	}

	const dbForm = document.getElementById('addToDatabaseForm')

	if (dbForm) {
		dbForm.removeAttribute('data-mode')
		dbForm.removeAttribute('data-old-name')
		dbForm.removeAttribute('data-parent-name')
		dbForm.removeAttribute('data-sub-key')
	}

	toggleFormFields()
}

// ============================================================
// 3. ANULOWANIE
// ============================================================

cancelBtn.onclick = () => {
	modal.style.display = 'none'

	mealForm.reset()

	const categorySelect = document.getElementById('db-category-select')

	if (categorySelect) {
		categorySelect.value = 'śniadanie'
	}

	const dbForm = document.getElementById('addToDatabaseForm')

	if (dbForm) {
		dbForm.removeAttribute('data-mode')
		dbForm.removeAttribute('data-old-name')
		dbForm.removeAttribute('data-parent-name')
		dbForm.removeAttribute('data-sub-key')
	}

	editingCard = null

	toggleFormFields()
}

// ============================================================
// 4. ZAMYKANIE MODALA
// ============================================================

function closeModal() {
	modal.style.display = 'none'

	mealForm.reset()

	const categorySelect = document.getElementById('db-category-select')

	if (categorySelect) {
		categorySelect.value = 'śniadanie'
	}

	const dbForm = document.getElementById('addToDatabaseForm')

	if (dbForm) {
		dbForm.removeAttribute('data-mode')
		dbForm.removeAttribute('data-old-name')
		dbForm.removeAttribute('data-parent-name')
		dbForm.removeAttribute('data-sub-key')
	}

	const saveBtn = document.getElementById('save-meal-btn')

	if (saveBtn) {
		saveBtn.removeAttribute('data-mode')
	}

	editingCard = null

	toggleFormFields()
}

// ============================================================
// 5. EDYCJA ZWYKŁEGO DANIA
// ============================================================

function editMeal(card) {
	if (!card) {
		return
	}

	// --------------------------------------------------------
	// Pobranie aktualnych danych z data-* karty
	// --------------------------------------------------------

	const currentName = card.getAttribute('data-name') || ''

	const currentCategory = card.getAttribute('data-category') || ''

	const currentIngredients = card.getAttribute('data-ingredients') || ''

	const currentRecipe = card.getAttribute('data-recipe') || ''

	// --------------------------------------------------------
	// Pobranie elementów modala
	// --------------------------------------------------------

	const modalOverlay = document.getElementById('modalOverlay')

	const dbForm = document.getElementById('addToDatabaseForm')

	const nameInput = document.getElementById('mealNameInput')

	const categorySelect = document.getElementById('db-category-select')

	const ingredientsInput = document.getElementById('ingredientsInput')

	const recipeInput = document.getElementById('recipeInput')

	// --------------------------------------------------------
	// Sprawdzenie wymaganych elementów
	// --------------------------------------------------------

	if (!modalOverlay || !dbForm || !nameInput || !categorySelect) {
		console.error('Błąd: Nie znaleziono kluczowych elementów modalu w DOM. Sprawdź ID w HTML.')

		return
	}

	// --------------------------------------------------------
	// Wpisanie danych do formularza
	// --------------------------------------------------------

	nameInput.value = currentName

	categorySelect.value = currentCategory

	if (ingredientsInput) {
		ingredientsInput.value = currentIngredients
	}

	if (recipeInput) {
		recipeInput.value = currentRecipe
	}

	// --------------------------------------------------------
	// Ustawienie trybu edycji
	// --------------------------------------------------------

	dbForm.setAttribute('data-mode', 'edit-meal')
	dbForm.setAttribute('data-old-name', currentName)

	const firebaseKey = card.getAttribute('data-firebase-key') || ''
	dbForm.setAttribute('data-firebase-key', firebaseKey)

	// Usuwamy ewentualne stare flagi innych trybów
	dbForm.removeAttribute('data-parent-name')
	dbForm.removeAttribute('data-sub-key')

	// --------------------------------------------------------
	// Otwieramy modal
	// --------------------------------------------------------

	modalOverlay.style.display = 'flex'

	// Ustawiamy odpowiednie pola
	toggleFormFields()
}

// ============================================================
// 6. OBSŁUGA WYSŁANIA FORMULARZA
// ============================================================

async function handleDatabaseFormSubmit(e) {
	e.preventDefault()

	// WAŻNE – pobieramy formularz przed warunkami
	const form = e.target

	// ========================================================
	// TRYB: ZMIANA SAMEJ NAZWY GOTOWCA
	// ========================================================

	if (form && form.getAttribute('data-mode') === 'edit-gotowiec-name') {
		const firebaseKey = form.getAttribute('data-firebase-key')
		const nameInput = document.getElementById('mealNameInput')
		const newName = nameInput ? nameInput.value.trim() : ''

		if (!newName) {
			alert('Nazwa zestawu nie może być pusta!')
			return
		}

		if (!firebaseKey) {
			console.error('Brak firebaseKey przy zmianie nazwy gotowca.')
			alert('Nie udało się znaleźć zestawu w bazie.')
			return
		}

		await saveGotowiecNameFromModal(firebaseKey, newName)

		return
	}

	// ========================================================
	// TRYB: EDYCJA SUB-DANIA
	// ========================================================

	if (form && form.getAttribute('data-mode') === 'edit-sub-meal') {
		const firebaseKey = form.getAttribute('data-parent-firebase-key')
		const subKey = form.getAttribute('data-sub-key')

		const nameInput = document.getElementById('mealNameInput')
		const ingredientsInput = document.getElementById('ingredientsInput')
		const recipeInput = document.getElementById('recipeInput')

		const newName = nameInput ? nameInput.value : 'Bez nazwy'
		const newIngredients = ingredientsInput ? ingredientsInput.value : ''
		const newRecipe = recipeInput ? recipeInput.value : ''

		if (!firebaseKey || !subKey) {
			console.error('Brak firebaseKey lub subKey dla edycji pod-dania.')
			alert('Nie można zapisać zmian. Brakuje identyfikatora dania.')
			return
		}

		await saveSubMealFromModal(firebaseKey, subKey, newName, newIngredients, newRecipe)

		return
	}

	// ========================================================
	// TRYB: NOWE DANIE / EDYCJA ZWYKŁEGO DANIA
	// ========================================================

	const categorySelect = document.getElementById('db-category-select')

	const category = categorySelect ? categorySelect.value : ''

	const nameInput = document.getElementById('mealNameInput')

	const mainName = nameInput ? nameInput.value.trim() : ''

	// Nazwa wymagana
	if (!mainName) {
		alert('Nazwa posiłku nie może być pusta!')

		return
	}

	// ========================================================
	// PODSTAWOWA STRUKTURA DANYCH
	// ========================================================

	let mealData = {
		category: category,

		name: mainName,
	}

	// ========================================================
	// GOTOWIEC
	// ========================================================

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
				name: document.getElementById('gotowiec-pr-name').value || 'Drugie śniadanie',

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
	}

	// ========================================================
	// ZWYKŁE DANIE
	// ========================================================
	else {
		const ingredientsInput = document.getElementById('ingredientsInput')

		const recipeInput = document.getElementById('recipeInput')

		mealData.ingredients = ingredientsInput ? ingredientsInput.value : ''

		mealData.recipe = recipeInput ? recipeInput.value : ''

		mealData.gotowiecData = null
	}

	// ========================================================
	// ZAPIS DO FIREBASE
	// ========================================================

	try {
		const isEditMode = form.getAttribute('data-mode') === 'edit-meal'
		const firebaseKey = form.getAttribute('data-firebase-key')

		// ----------------------------------------------------
		// EDYCJA ISTNIEJĄCEGO POSIŁKU
		// ----------------------------------------------------

		if (isEditMode && firebaseKey) {
			const oldName = form.getAttribute('data-old-name') || ''

			// 1. Aktualizacja dania w głównej bazie
			await db.ref(`mealDatabase/${firebaseKey}`).set(mealData)

			// 2. Jeżeli zmieniła się nazwa, aktualizujemy ją również
			//    we wszystkich miejscach tygodniowego jadłospisu
			if (oldName && oldName !== mainName) {
				const weeklySnapshot = await db.ref('weeklyPlan').once('value')
				const weeklyPlan = weeklySnapshot.val() || {}

				const updates = {}

				Object.entries(weeklyPlan).forEach(([cellId, meal]) => {
					if (meal && meal.name === oldName) {
						updates[`${cellId}/name`] = mainName
					}
				})

				if (Object.keys(updates).length > 0) {
					await db.ref('weeklyPlan').update(updates)
				}
			}

			alert('Posiłek został pomyślnie zaktualizowany w bazie!')
		}

		// ----------------------------------------------------
		// NOWY POSIŁEK
		// ----------------------------------------------------
		else {
			await db.ref('mealDatabase').push(mealData)

			alert('Posiłek został pomyślnie dodany do bazy!')
		}

		// ----------------------------------------------------
		// CZYSZCZENIE FORMULARZA
		// ----------------------------------------------------

		form.removeAttribute('data-mode')
		form.removeAttribute('data-old-name')
		form.removeAttribute('data-firebase-key')
		form.removeAttribute('data-parent-name')
		form.removeAttribute('data-sub-key')

		form.reset()

		// ----------------------------------------------------
		// ZAMKNIĘCIE MODALA
		// ----------------------------------------------------

		const modalOverlay = document.getElementById('modalOverlay')

		if (modalOverlay) {
			modalOverlay.style.display = 'none'
		}

		toggleFormFields()

		// ----------------------------------------------------
		// AKTUALIZACJA LICZNIKÓW
		// ----------------------------------------------------

		if (typeof updateAllCounts === 'function') {
			updateAllCounts()
		}
	} catch (error) {
		// ========================================================
		// BŁĄD
		// ========================================================

		console.error('Błąd zapisu Firebase:', error)
		alert('Wystąpił błąd podczas zapisu. Sprawdź konsolę (F12).')
	}
}

// ============================================================
// 7. ZMIANA SAMEJ NAZWY GOTOWCA
// ============================================================

async function saveGotowiecNameFromModal(firebaseKey, newName) {
	try {
		if (!firebaseKey) {
			alert('Nie znaleziono identyfikatora zestawu w bazie.')
			return
		}

		// Zmieniamy TYLKO nazwę konkretnego gotowca
		await db.ref(`mealDatabase/${firebaseKey}/name`).set(newName)

		const dbForm = document.getElementById('addToDatabaseForm')

		if (dbForm) {
			dbForm.removeAttribute('data-mode')
			dbForm.removeAttribute('data-old-name')
			dbForm.removeAttribute('data-firebase-key')
			dbForm.removeAttribute('data-parent-name')
			dbForm.removeAttribute('data-sub-key')
			dbForm.reset()
		}

		const modalOverlay = document.getElementById('modalOverlay')

		if (modalOverlay) {
			modalOverlay.style.display = 'none'
		}

		toggleFormFields()

		if (typeof updateAllCounts === 'function') {
			updateAllCounts()
		}

		alert('Nazwa zestawu została pomyślnie zaktualizowana!')
	} catch (error) {
		console.error('Błąd podczas zmiany nazwy zestawu:', error)
		alert('Wystąpił błąd podczas zmiany nazwy w bazie danych.')
	}
}

// ============================================================
// 8. USUWANIE DANIA / GOTOWCA – DOM + LOCALSTORAGE + FIREBASE
// ============================================================

async function deleteMeal(card) {
	if (!card) return

	const mealName = card.getAttribute('data-name') || card.querySelector('.meal-name-text')?.innerText || 'to danie'

	const firebaseKey = card.getAttribute('data-firebase-key') || ''

	if (!firebaseKey) {
		alert('Nie można usunąć dania — brak firebaseKey.')
		return
	}

	const confirmed = confirm(`Czy na pewno chcesz usunąć "${mealName}"?`)

	if (!confirmed) return

	try {
		// 1. Znajdź wszystkie wpisy tego konkretnego dania w weeklyPlan
		const weeklyPlanSnapshot = await db.ref('weeklyPlan').once('value')

		const weeklyPlan = weeklyPlanSnapshot.val() || {}

		const updates = {}

		Object.entries(weeklyPlan).forEach(([cellId, meal]) => {
			if (meal.firebaseKey === firebaseKey) {
				updates[cellId] = null
			}
		})

		// 2. Usuń wpisy tego dania z weeklyPlan
		if (Object.keys(updates).length > 0) {
			await db.ref('weeklyPlan').update(updates)
		}

		// 3. Usuń konkretne danie z mealDatabase
		await db.ref(`mealDatabase/${firebaseKey}`).remove()

		console.log(`Usunięto danie "${mealName}" (${firebaseKey})`)
	} catch (error) {
		console.error('Błąd podczas usuwania dania:', error)

		alert('Wystąpił błąd podczas usuwania dania.')
	}
}

// ============================================================
// 9. LICZNIKI W AKORDEONACH
// ============================================================

function updateAllCounts() {
	const accordions = document.querySelectorAll('.category-accordion')

	accordions.forEach(acc => {
		// Liczymy tylko główne karty
		// Pomijamy sub-card
		const count = acc.querySelectorAll('.meal-card:not(.sub-card)').length

		const countSpan = acc.querySelector('.meal-count')

		if (countSpan) {
			countSpan.innerText = `(${count})`
		}
	})
}

// ============================================================
// 10. PODGLĄD ZWYKŁEGO DANIA
// ============================================================

function togglePreview(button) {
	if (!button) {
		return
	}

	const card = button.closest('.meal-card')

	if (!card) {
		return
	}

	const preview = card.querySelector('.ingredients-preview')

	if (!preview) {
		return
	}

	const isActive = preview.classList.toggle('active')

	button.innerText = isActive ? 'Ukryj' : 'Podgląd'
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
			{ cat: 'drugie-śniadanie', key: 'snack' },
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
						fillTableCell(
							cell,
							mealInfo.name,
							mealInfo.ingredients,
							mealInfo.recipe,
							currentMealData.firebaseKey || '',
							item.key,
						)
					}
				}
			}
		})

		if (typeof saveWeeklyPlanToFirebase === 'function') saveWeeklyPlanToFirebase()
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
			if (typeof saveWeeklyPlanToFirebase === 'function') saveWeeklyPlanToFirebase()
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

function fillTableCell(cell, name, ingredients, recipe = '', firebaseKey = '', subKey = '') {
	cell.style.position = 'relative'
	cell.style.verticalAlign = 'center'
	cell.style.padding = '23px 5px 5px 5px'

	// Zabezpieczenie przed wartościami undefined/null oraz cudzysłowami
	const safeIng = (ingredients || '').replace(/"/g, '&quot;')
	const safeRec = (recipe || '').replace(/"/g, '&quot;')
	const safeFirebaseKey = firebaseKey || ''
	const safeSubKey = subKey || ''

	cell.innerHTML = `
        <div
            class="meal-container"
            data-ingredients="${safeIng}"
            data-recipe="${safeRec}"
            data-firebase-key="${safeFirebaseKey}"
			data-sub-key="${safeSubKey}"
        >
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

// Osobna funkcja do czyszczenia, aby kod w HTML był czystszy
async function clearCell(btn) {
	const cell = btn.closest('td')

	if (!cell) return

	const mealName = cell.querySelector('.meal-name-text')?.innerText || 'to danie'

	const confirmed = confirm(`Czy na pewno chcesz usunąć "${mealName}"?`)

	if (!confirmed) return

	setEmptyCell(cell)
	await saveWeeklyPlanToFirebase()
}

// --- FUNKCJE ZAPISU DO TABELI ---

async function saveWeeklyPlanToFirebase() {
	const tableData = {}

	document.querySelectorAll('td[id]').forEach(cell => {
		const mealDiv = cell.querySelector('.meal-container')

		if (mealDiv) {
			tableData[cell.id] = {
				name: mealDiv.querySelector('.meal-name-text').innerText,
				ingredients: mealDiv.getAttribute('data-ingredients'),
				recipe: mealDiv.getAttribute('data-recipe'),
				firebaseKey: mealDiv.getAttribute('data-firebase-key') || '',
				subKey: mealDiv.getAttribute('data-sub-key') || '',
			}
		}
	})

	await db.ref('weeklyPlan').set(tableData)
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

		const cats = ['śniadanie-lub-kolacja', 'obiad', 'drugie-śniadanie-lub-podwieczorek', 'gotowiec', 'wszystkie']
		filterBar.innerHTML = ''

		const categoryLabels = {
			'śniadanie-lub-kolacja': 'Śniadanie lub kolacja',
			obiad: 'Obiad',
			'drugie-śniadanie-lub-podwieczorek': 'Drugie śniadanie lub podwieczorek',
			gotowiec: 'Gotowiec',
			wszystkie: 'Wszystkie',
		}

		cats.forEach(c => {
			const isAll = c === 'wszystkie'
			const isActive = (isAll && activeCat === '') || activeCat === c

			const b = document.createElement('button')
			b.innerText = categoryLabels[c].toUpperCase()
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
			<small style="background:#eee; padding:2px 6px; border-radius:4px; font-size:10px;">${categoryLabels[meal.category] || meal.category}</small>
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
							{ cat: 'drugie-śniadanie', key: 'snack' },
							{ cat: 'obiad', key: 'lunch' },
							{ cat: 'kolacja', key: 'dinner' },
						]

						mapping.forEach(mItem => {
							const mealInfo = data[mItem.key]
							if (mealInfo && mealInfo.name) {
								const row = document.querySelector(`#mealTable tr[data-category="${mItem.cat}"]`)
								let cell = null

								if (row) {
									cell = row.cells[dayNum]
								}
								if (cell) {
									fillTableCell(
										cell,
										mealInfo.name,
										mealInfo.ingredients,
										mealInfo.recipe,
										meal.firebaseKey || '',
										mItem.key,
									)
								}
							}
						})
						saveWeeklyPlanToFirebase()
					}
				} else {
					// Standardowe pojedyncze danie
					const mealRecipe = meal.recipe || ''
					fillTableCell(currentTargetCell, meal.name, meal.ingredients, mealRecipe, meal.firebaseKey || '')
					saveWeeklyPlanToFirebase()
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
	const showShoppingListBtn = document.getElementById('showShoppingListBtn')
	const showShoppingListBtns = document.getElementById('showShoppingListBtns')
	const shoppingContainer = document.getElementById('shoppingListContainer')
	const shoppingSection = document.getElementById('shoppingListSection')
	const deleteShoppingListBtn = document.getElementById('deleteShoppingListBtn')

	deleteShoppingListBtn.addEventListener('click', deleteShoppingList)

	// Elementy nowego modalu wyboru dni
	const shoppingDaysModal = document.getElementById('shoppingDaysModal')
	const closeDaysModalBtn = document.getElementById('closeDaysModalBtn')
	const confirmGenerateListBtn = document.getElementById('confirmGenerateListBtn')
	const selectAllDaysCb = document.getElementById('selectAllDays')
	const dayCheckboxes = document.querySelectorAll('.day-selection-cb')

	const CATEGORY_ORDER = ['olej', 'passaty', 'owoce', 'warzywa', 'chleb', 'nabiał', 'mięso', 'jajka', 'kasze' , 'mrozonki', 'inne']

	const INGREDIENT_TO_CATEGORY = {
		//olej
		olej: 'olej',
		oliwa: 'olej',

		//passaty
		passat: 'passaty',
		ciecierzyc: 'passaty',

		//owoce
		jabłko: 'owoce',
		banan: 'owoce',
		cytryna: 'owoce',
		truskawk: 'owoce',
		borówk: 'owoce',
		awokado: 'owoce',
		mango: 'owoce',
		maliny: 'owoce',
		pomarańcz: 'owoce',

		//warzywa
		pomidor: 'warzywa',
		ogórek: 'warzywa',
		cebula: 'warzywa',
		czosnek: 'warzywa',
		marchewka: 'warzywa',
		ziemniak: 'warzywa',
		sałat: 'warzywa',
		szpinak: 'warzywa',
		papryka: 'warzywa',
		cukinia: 'warzywa',
		rzodkiewka: 'warzywa',
		seler: 'warzywa',
		kapary: 'warzywa',

		//chleb
		bułk: 'chleb',
		kromk: 'chleb',

		//nabiał
		ser: 'nabiał',
		twaróg: 'nabiał',
		jogurt: 'nabiał',
		masł: 'nabiał',
		ricotta: 'nabiał',

		//mięso
		kurczak: 'mięso',
		pierś: 'mięso',
		mielone: 'mięso',
		wołowin: 'mięso',

		//jajka
		jaj: 'jajka',
		mleko: 'jajka',

		//kasze
		kasza: 'kasze',
		mąka: 'kasze',
		płatki: 'kasze',
		amarantus: 'kasze',

		//mrożonki
		mrożon: 'mrozonki',
		filet: 'mrozonki',

		//inne
		tubka: 'inne'
	}

	function getItemCategory(name) {
    const lowerName = name.toLowerCase().trim()

    // Wyjątki — sprawdzamy je przed zwykłymi kategoriami
    if (lowerName.includes('masło orzechowe')) {
        return 'inne'
    }
	if (lowerName.includes('tubka')) {
        return 'inne'
    }

    // Standardowe przypisywanie do kategorii
    for (const [keyword, category] of Object.entries(INGREDIENT_TO_CATEGORY)) {
        if (lowerName.includes(keyword)) return category
    }

    return 'inne'
}

	function getPolishForm(n, s1, s2, s3) {
		if (n === 1) return s1
		const n10 = n % 10
		const n100 = n % 100
		if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return s2
		return s3
	}

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

	// --- LOGIKA MODALU WYBORU DNI ---

	// 1. Kliknięcie głównego przycisku otwiera modal zamiast generować listę od razu
	generateListBtn.onclick = async () => {
		try {
			// Usunięcie starej listy z Firebase
			await db.ref('shoppingList').remove()

			// Wyczyszczenie starej listy z ekranu
			shoppingContainer.innerHTML = ''
			shoppingContainer.style.display = 'none'

			// Ukrycie przycisków listy
			showShoppingListBtns.style.display = 'none'

			// Przywrócenie przycisku "POKAŻ LISTĘ"
			showShoppingListBtn.textContent = 'POKAŻ LISTĘ'

			// Otwarcie modala wyboru dni
			shoppingDaysModal.style.display = 'flex'
		} catch (error) {
			console.error('Błąd usuwania starej listy:', error)
			alert('Nie udało się usunąć starej listy zakupów.')
		}
	}

	showShoppingListBtn.onclick = async () => {
		// LISTA JEST OTWARTA → ZAMYKAMY
		if (shoppingListContainer.style.display === 'block') {
			closeShoppingList()
			return
		}

		try {
			const snapshot = await db.ref('shoppingList').once('value')
			const savedShoppingList = snapshot.val()

			// LISTA JUŻ ISTNIEJE
			if (Array.isArray(savedShoppingList) && savedShoppingList.length > 0) {
				renderShoppingList(savedShoppingList)

				showShoppingList()

				return
			}

			// LISTY JESZCZE NIE MA
			shoppingDaysModal.style.display = 'flex'
		} catch (error) {
			console.error('Błąd podczas otwierania listy zakupów:', error)
		}
	}

	// 2. Zamknięcie modalu
	closeDaysModalBtn.onclick = () => {
		shoppingDaysModal.style.display = 'none'
	}

	// 3. Masowe zaznaczanie / odznaczanie dni
	selectAllDaysCb.onchange = e => {
		dayCheckboxes.forEach(cb => {
			cb.checked = e.target.checked
		})
	}

	// Opcjonalnie: odznacz "Zaznacz wszystko", jeśli użytkownik ręcznie odznaczy pojedynczy dzień
	dayCheckboxes.forEach(cb => {
		cb.addEventListener('change', () => {
			const allChecked = Array.from(dayCheckboxes).every(c => c.checked)
			selectAllDaysCb.checked = allChecked
		})
	})

	function formatShoppingQuantity(quantity, unit) {
		const amount = Math.round(quantity * 100) / 100

		if (unit === 'g' && amount >= 1000) {
			const kg = Math.floor(amount / 1000)
			const g = Math.round(amount % 1000)

			return `${kg}kg${g > 0 ? ` ${g}g` : ''}`
		}

		if (unit === 'ml' && amount >= 1000) {
			const l = Math.floor(amount / 1000)
			const ml = Math.round(amount % 1000)

			return `${l}l${ml > 0 ? ` ${ml}ml` : ''}`
		}

		return `${amount}${unit}`
	}

	function renderShoppingList(finalShoppingList) {
		shoppingContainer.innerHTML = ''

		finalShoppingList.sort((a, b) => {
			// Ręcznie dodane produkty zawsze na dole
			if (a.additional && !b.additional) return 1
			if (!a.additional && b.additional) return -1

			// Jeśli oba są ręcznie dodane,
			// zachowujemy ich kolejność z Firebase
			if (a.additional && b.additional) return 0

			// Normalne produkty sortujemy według kategorii
			const indexA = CATEGORY_ORDER.indexOf(a.category)
			const indexB = CATEGORY_ORDER.indexOf(b.category)

			const weightA = indexA === -1 ? 999 : indexA
			const weightB = indexB === -1 ? 999 : indexB

			if (weightA !== weightB) {
				return weightA - weightB
			}

			// W ramach kategorii alfabetycznie
			return a.sortKey.localeCompare(b.sortKey, 'pl')
		})

		finalShoppingList.forEach(item => {
			const el = document.createElement('div')
			el.className = 'shopping-item'

			// PRODUKT RĘCZNY
			if (item.additional) {
				el.innerHTML = `
                <input type="checkbox">

                <span class="shopping-item-name">
                    ${item.label}
                </span>

                <button
                    type="button"
                    class="delete-shopping-item-btn"
                >×</button>
            `

				// PRODUKT GENEROWANY
			} else {
				el.innerHTML = `
    <input type="checkbox">

    <span class="shopping-item-name">
        ${item.displayName || item.label}
    </span>

    <input
        type="text"
        class="shopping-item-quantity"
        value="${item.quantity !== undefined ? item.quantity : 0}"
        min="0"
        step="0.01"
    >

    <span class="shopping-item-unit">
        ${item.unit || ''}
    </span>

    ${item.additional ? '<button type="button" class="delete-shopping-item-btn">×</button>' : ''}
`
			}

			// =========================
			// CHECKBOX
			// =========================

			const checkbox = el.querySelector('input[type="checkbox"]')

			checkbox.checked = item.checked === true

			checkbox.addEventListener('change', async () => {
				try {
					const snapshot = await db.ref('shoppingList').once('value')
					const shoppingList = snapshot.val() || []

					const firebaseIndex = shoppingList.findIndex(savedItem => savedItem?.sortKey === item.sortKey)

					if (firebaseIndex === -1) {
						console.error('Nie znaleziono produktu w Firebase:', item.sortKey)
						return
					}

					await db.ref(`shoppingList/${firebaseIndex}/checked`).set(checkbox.checked)

					item.checked = checkbox.checked
				} catch (error) {
					console.error('Błąd zapisu statusu produktu:', error)
				}
			})

			// =========================
			// EDYCJA ILOŚCI
			// =========================

			const quantityInput = el.querySelector('.shopping-item-quantity')

			if (quantityInput) {
				// Dopasowanie szerokości inputa do ilości znaków
				const resizeQuantityInput = () => {
					quantityInput.style.width = `${Math.max(2, quantityInput.value.length)}ch`
				}

				// Ustaw szerokość od razu po utworzeniu produktu
				resizeQuantityInput()

				// Zmieniaj szerokość podczas wpisywania
				quantityInput.addEventListener('input', resizeQuantityInput)

				quantityInput.addEventListener('change', async () => {
					const newQuantity = parseFloat(quantityInput.value)

					// Nieprawidłowa wartość
					if (isNaN(newQuantity) || newQuantity < 0) {
						quantityInput.value = item.quantity
						resizeQuantityInput()
						return
					}

					try {
						const snapshot = await db.ref('shoppingList').once('value')
						const shoppingList = (snapshot.val() || []).filter(Boolean)

						const firebaseIndex = shoppingList.findIndex(savedItem => savedItem.sortKey === item.sortKey)

						if (firebaseIndex === -1) {
							console.error('Nie znaleziono produktu:', item.sortKey)
							return
						}

						// Aktualizacja ilości
						shoppingList[firebaseIndex].quantity = newQuantity

						// Aktualizacja label
						shoppingList[firebaseIndex].label = `${item.displayName} <strong>${formatShoppingQuantity(
							newQuantity,
							item.unit,
						)}</strong>`

						// Zapis do Firebase
						await db.ref('shoppingList').set(shoppingList)

						// Aktualizacja lokalnego obiektu
						item.quantity = newQuantity

						item.label = `${item.displayName} <strong>${formatShoppingQuantity(newQuantity, item.unit)}</strong>`

						// Dopasuj szerokość po zapisaniu
						resizeQuantityInput()
					} catch (error) {
						console.error('Błąd zapisu ilości produktu:', error)
					}
				})
			}

			// =========================
			// USUWANIE PRODUKTU RĘCZNEGO
			// =========================

			const deleteBtn = el.querySelector('.delete-shopping-item-btn')

			if (deleteBtn) {
				deleteBtn.addEventListener('click', async () => {
					const confirmed = confirm('Czy na pewno chcesz usunąć ten produkt?')

					if (!confirmed) return

					try {
						const snapshot = await db.ref('shoppingList').once('value')

						const shoppingList = (snapshot.val() || []).filter(Boolean)

						const firebaseIndex = shoppingList.findIndex(savedItem => savedItem.sortKey === item.sortKey)

						if (firebaseIndex === -1) {
							console.error('Nie znaleziono produktu do usunięcia:', item.sortKey)
							return
						}

						shoppingList.splice(firebaseIndex, 1)

						await db.ref('shoppingList').set(shoppingList)

						el.remove()
					} catch (error) {
						console.error('Błąd usuwania produktu:', error)
					}
				})
			}

			shoppingContainer.appendChild(el)
		})

		showShoppingList()
	}

	// --- WŁAŚCIWE GENEROWANIE LISTY (ZAKOŃCZENIE PRACY W MODALU) ---
	confirmGenerateListBtn.onclick = async () => {
		// Pobierz tablicę wybranych indeksów dni z modalu (0 = Poniedziałek, 6 = Niedziela)
		const selectedDays = Array.from(dayCheckboxes)
			.filter(cb => cb.checked)
			.map(cb => parseInt(cb.value))

		if (selectedDays.length === 0) {
			alert('Wybierz przynajmniej jeden dzień, aby wygenerować listę!')
			return
		}

		const meals = document.querySelectorAll('.meal-container[data-ingredients]')
		const summary = {}

		meals.forEach(meal => {
			// 1. Szukamy komórki <td>, w której znajduje się ten posiłek (np. <td id="sn-1">)
			const cell = meal.closest('td')
			let mealDayIndex = -1

			if (cell && cell.id) {
				// 2. Wyciągamy liczbę po myślniku z ID komórki (np. "sn-1" da nam "1")
				const match = cell.id.match(/-(\d+)$/)
				if (match) {
					// Zamieniamy system 1-7 z Twojego HTML na system 0-6 z modalu (odejmując 1)
					mealDayIndex = parseInt(match[1]) - 1
				}
			}

			// 3. Jeśli ustaliliśmy dzień i NIE ma go na liście zaznaczonych w modalu – pomijamy posiłek!
			if (mealDayIndex !== -1 && !selectedDays.includes(mealDayIndex)) {
				return
			}

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
					summary[key] = { displayName: name, qty: 0, unit: unit, isBread: isBread }
				}
				summary[key].qty += qty
			})
		})

		if (Object.keys(summary).length === 0) {
			shoppingSection.style.display = 'none'
			shoppingDaysModal.style.display = 'none'
			alert('Wybrane dni nie zawierają posiłków ze składnikami!')
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
					if (remainingSlices > 0) htmlContent += ` + kromki <strong>${remainingSlices}</strong>`
				} else {
					htmlContent = `chleb (kromki) <strong>${remainingSlices}</strong>`
				}
			} else {
				sortKey = itemData.displayName.toLowerCase()
				if (itemData.unit === 'g' && amount >= 1000) {
					const kg = Math.floor(amount / 1000),
						g = Math.round(amount % 1000)
					htmlContent = `${itemData.displayName} <strong>${kg}kg${g > 0 ? ` ${g}g` : ''}</strong>`
				} else if (itemData.unit === 'ml' && amount >= 1000) {
					const l = Math.floor(amount / 1000),
						ml = Math.round(amount % 1000)
					htmlContent = `${itemData.displayName} <strong>${l}l${ml > 0 ? ` ${ml}ml` : ''}</strong>`
				} else {
					htmlContent = `${itemData.displayName} <strong>${amount}${itemData.unit}</strong>`
				}
			}

			const itemCategory = key === 'BREAD_TOTAL' ? getItemCategory('chleb') : getItemCategory(itemData.displayName)
			list.push({
				label: htmlContent,
				displayName: itemData.displayName,
				sortKey: sortKey,
				category: itemCategory,
				checked: false,
				quantity: amount,
				unit: itemData.unit,
			})
		})

		const shoppingListSnapshot = await db.ref('shoppingList').once('value')

		const savedShoppingList = shoppingListSnapshot.val() || []

		// Zachowaj zaznaczenie wygenerowanych produktów
		list.forEach(item => {
			const savedItem = savedShoppingList.find(saved => saved.sortKey === item.sortKey)

			if (savedItem) {
				item.checked = savedItem.checked === true
			}
		})

		// Zachowaj ręcznie dodane produkty
		const additionalItems = savedShoppingList.filter(item => item.additional === true)

		// Połącz nową listę z produktami dodanymi ręcznie
		const finalShoppingList = [...list, ...additionalItems]

		// Zapisz całą listę do Firebase
		await db.ref('shoppingList').set(finalShoppingList)

		// Wyświetl wygenerowaną listę
		renderShoppingList(finalShoppingList)

		// Zamknij modal
		shoppingDaysModal.style.display = 'none'
	}

	const refreshListBtn = document.getElementById('refreshListBtn')
	if (refreshListBtn) {
		refreshListBtn.onclick = () => {
			// Odświeżanie wykonuje ponowne kliknięcie ukrytego potwierdzenia (generuje dla aktualnie zaznaczonych dni w modalu)
			confirmGenerateListBtn.click()
		}
	}

	function showShoppingList() {
		shoppingListContainer.style.display = 'block'
		showShoppingListBtns.style.display = 'flex'
		showShoppingListBtn.textContent = 'ZAMKNIJ LISTĘ'
	}

	function closeShoppingList() {
		shoppingListContainer.style.display = 'none'
		showShoppingListBtns.style.display = 'none'

		showShoppingListBtn.textContent = 'POKAŻ LISTĘ'
	}
})

async function deleteShoppingList() {
	const confirmed = confirm('Czy na pewno chcesz usunąć całą listę zakupów?')

	if (!confirmed) {
		return
	}

	try {
		await db.ref('shoppingList').remove()

		console.log('Lista zakupów została usunięta z Firebase')
	} catch (error) {
		console.error('Błąd usuwania listy z Firebase:', error)

		alert('Nie udało się usunąć listy zakupów.')

		return
	}

	// Pobieramy elementy bezpośrednio
	const shoppingContainer = document.getElementById('shoppingListContainer')
	const showShoppingListBtns = document.getElementById('showShoppingListBtns')
	const showShoppingListBtn = document.getElementById('showShoppingListBtn')

	// Wyczyść i ukryj listę
	if (shoppingContainer) {
		shoppingContainer.innerHTML = ''
		shoppingContainer.style.display = 'none'
	}

	// Ukryj przyciski + / odświeżanie / usuń
	if (showShoppingListBtns) {
		showShoppingListBtns.style.display = 'none'
	}

	// Przywróć "POKAŻ LISTĘ"
	if (showShoppingListBtn) {
		showShoppingListBtn.textContent = 'POKAŻ LISTĘ'
	}
}

deleteShoppingListBtn.addEventListener('click', deleteShoppingList)

// --- POBIERANIE LISTY ZAKÓPÓW ---

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

			// Aktualne dane pobrane z Firebase
			const currentDb = globalMealDatabase || []

			// Sprawdzamy istniejące nazwy
			const existingNames = new Set(currentDb.map(m => m.name?.toLowerCase().trim()).filter(Boolean))

			// Usuwamy duplikaty z importowanego pliku
			const newMeals = importedData.filter(m => {
				if (!m.name) return false

				const normalizedName = m.name.toLowerCase().trim()

				if (existingNames.has(normalizedName)) {
					return false
				}

				// Dodajemy nazwę do Setu, żeby również
				// duplikaty znajdujące się wewnątrz samego pliku
				// nie zostały dodane kilka razy
				existingNames.add(normalizedName)

				return true
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
				// Tworzymy osobny klucz Firebase dla każdego nowego posiłku
				const updates = {}

				newMeals.forEach(meal => {
					const firebaseKey = db.ref('mealDatabase').push().key

					updates[firebaseKey] = meal
				})

				// Dodajemy tylko nowe rekordy.
				// Nie nadpisujemy istniejącej bazy.
				await db.ref('mealDatabase').update(updates)

				updateAllCounts()

				alert('Import zakończony sukcesem! Dane są już w chmurze.')

				// Firebase .on('value') automatycznie odświeży listę
			}
		} catch (err) {
			alert('Błąd podczas importu: ' + err.message)

			console.error(err)
		}

		event.target.value = ''
	}

	reader.readAsText(file)
}

// --- DRUKOWANIE ---

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

// --- UDOSTĘPNIANIE DO NOTATEK ---

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

async function migrateMealDatabaseToFirebaseKeys() {
	try {
		const snapshot = await db.ref('mealDatabase').once('value')
		const rawData = snapshot.val()

		if (!Array.isArray(rawData)) {
			alert('Baza nie jest tablicą. Migracja nie jest potrzebna.')
			return
		}

		const updates = {}

		rawData.forEach(meal => {
			if (!meal) return

			const firebaseKey = db.ref('mealDatabase').push().key

			updates[firebaseKey] = meal
		})

		await db.ref('mealDatabase').set(updates)

		alert(`Migracja zakończona. Przeniesiono ${Object.keys(updates).length} dań.`)
	} catch (error) {
		console.error('Błąd migracji mealDatabase:', error)
		alert('Błąd podczas migracji bazy. Sprawdź konsolę.')
	}
}

// Zamykanie modali po kliknięciu w tło

// window.onclick = e => {
// 	if (e.target === modal) closeModal()
// 	const picker = document.getElementById('mealPickerModal')
// 	if (e.target === picker) closeMealPicker()
// 	const mealModal = document.getElementById('meal-modal')
// 	if (e.target === mealModal) closeModalBnt()
// 	const infoModal = document.getElementById('infoModal')
// 	if (e.target == infoModal) closeInfoModal()
// }
