if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('sw.js')
}

// --- KONFIGURACJA FIREBASE ---
const firebaseConfig = {
	apiKey: 'AIzaSyBRVtplChkbGQsT10SvQXnYywLYKRVIY3E',
	authDomain: 'jadlospis-bee5a.firebaseapp.com',
	// Upewnij się, że ten link zgadza się z tym, co widzisz w zakładce Realtime Database!
	databaseURL: 'https://jadlospis-bee5a-default-rtdb.europe-west1.firebasedatabase.app/',
	projectId: 'jadlospis-bee5a',
	storageBucket: 'jadlospis-bee5a.firebasestorage.app',
	messagingSenderId: '934978468199',
	appId: '1:934978468199:web:354a6cb971784796b497c2',
}

// Inicjalizacja (Styl Compat - pasuje do reszty Twojego kodu)
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
			// TUTAJ BYŁ BŁĄD: Musisz przekazać 4 argumenty (cell, name, ingredients, recipe)
			fillTableCell(
				cell,
				data[cell.id].name,
				data[cell.id].ingredients,
				data[cell.id].recipe || '', // Dodajemy przepis z bazy!
			)
		} else {
			cell.innerHTML = `<button class="add-btn table-btn" onclick="openMealPicker(this)">+</button>`
			cell.style.padding = '5px'
		}
	})
})

// 2. ODBIERANIE BAZY DAŃ (TWOICH PRZEPISÓW)
db.ref('mealDatabase').on('value', snapshot => {
	const data = snapshot.val() || []
	globalMealDatabase = data

	// 1. Czyszczenie i renderowanie bazy (akordeonów)
	document.querySelectorAll('.category-content').forEach(c => (c.innerHTML = ''))

	data.forEach(meal => {
		if (meal && meal.category) {
			// Przekazujemy shouldSave = false, żeby nie nadpisywać Firebase przy każdym posiłku
			createNewMealCard(meal.category, meal.name, meal.ingredients, meal.recipe, false)
		}
	})

	// 2. AKTUALIZACJA LICZNIKÓW (Bardzo ważne tutaj!)
	updateAllCounts()

	// 3. SYNCHRONIZACJA DANYCH W TABELI
	let localTableUpdated = false
	const allPlannedMeals = document.querySelectorAll('.meal-container')

	allPlannedMeals.forEach(container => {
		const mealNameInTable = container.querySelector('.meal-name-text').innerText
		const updatedMeal = data.find(m => m.name === mealNameInTable)

		if (updatedMeal) {
			const currentIng = container.getAttribute('data-ingredients')
			const currentRec = container.getAttribute('data-recipe')

			// Sprawdzamy różnice
			if (currentIng !== (updatedMeal.ingredients || '') || currentRec !== (updatedMeal.recipe || '')) {
				container.setAttribute('data-ingredients', updatedMeal.ingredients || '')
				container.setAttribute('data-recipe', updatedMeal.recipe || '')
				localTableUpdated = true
			}
		}
	})

	// 4. ZAPIS DO FIREBASE (Tylko jeśli faktycznie coś się zmieniło w danych)
	if (localTableUpdated) {
		console.log('Synchronizacja: Dane posiłku w tabeli zostały zaktualizowane na podstawie bazy.')

		// UWAGA: Wywołaj zapis do Firebase TYLKO jeśli Twoja funkcja
		// saveTableToLocalStorage ma wbudowane sprawdzanie różnic lub
		// jeśli to absolutnie konieczne.
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

	// 1. Rozgrzewanie animacji (Hover)
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

	// 2. Obsługa otwierania/zamykania akordeonów
	document.querySelectorAll('.category-accordion summary').forEach(summary => {
		summary.addEventListener('click', e => {
			const details = summary.parentElement // Lepiej użyć summary.parentElement
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

	// Wywołanie przy starcie strony
	updateAllCounts()
})

// --- WYCIĄGNIJ FUNKCJĘ TUTAJ (na zewnątrz) ---
// Dzięki temu będzie dostępna dla Firebase i funkcji deleteMeal
function updateAllCounts() {
	const accordions = document.querySelectorAll('.category-accordion')

	accordions.forEach(acc => {
		const count = acc.querySelectorAll('.meal-card').length
		const countSpan = acc.querySelector('.meal-count')

		if (countSpan) {
			countSpan.innerText = `(${count})`
		}
	})
}

// --- TRYB CIEMNY ---

// Wywołaj to przy starcie (np. w DOMContentLoaded), aby przywrócić zapisany tryb
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

// Pamiętaj, aby dodać initTheme() do swojego document.addEventListener('DOMContentLoaded', ...)

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
		mealsData.push({
			category: card.getAttribute('data-category'),
			name: card.getAttribute('data-name'),
			ingredients: card.getAttribute('data-ingredients'),
			recipe: card.getAttribute('data-recipe'),
		})
	})
	// To wysyła listę wszystkich Twoich dań do Firebase
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
	const name = document.getElementById('mealNameInput').value
	const ingredients = document.getElementById('ingredientsInput').value
	const recipe = document.getElementById('recipeInput').value // Pobieramy przepis

	if (editingCard) {
		// Dodajemy przepis jako 5-ty argument
		updateMealCard(editingCard, category, name, ingredients, recipe)
	} else {
		// Dodajemy przepis jako 4-ty argument
		createNewMealCard(category, name, ingredients, recipe, true)
	}

	saveDatabaseToLocalStorage()
	closeModal()
}

function createNewMealCard(category, name, ingredients, recipe, shouldSave) {
	const safeCat = category.replace('ą', 'a')
	const accordion = document.getElementById(`db-${safeCat}`)

	if (!accordion) {
		console.error('Nie znaleziono akordeonu dla kategorii:', safeCat)
		return
	}

	const targetSection = accordion.querySelector('.category-content')
	const mealCard = document.createElement('div')
	mealCard.className = 'meal-card'

	// Przekazujemy przepis dalej
	updateMealCard(mealCard, category, name, ingredients, recipe)
	targetSection.appendChild(mealCard)

	if (shouldSave) saveDatabaseToLocalStorage()
	updateAllCounts()
}

function updateMealCard(card, category, name, ingredients, recipe) {
	const safeName = (name || 'Bez nazwy').toString()
	const safeIngredients = (ingredients || '').toString()
	const safeRecipe = (recipe || '').toString() // Zabezpieczenie przepisu

	card.setAttribute('data-name', safeName)
	card.setAttribute('data-ingredients', safeIngredients)
	card.setAttribute('data-category', category)
	card.setAttribute('data-recipe', safeRecipe) // Zapisujemy przepis w atrybucie karty

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
								? `
            <div class="preview-section" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
                <strong>Przepis:</strong><br>
                <small style="line-height: 1.4; white-space: pre-wrap;">${safeRecipe}</small>
            </div>`
								: ''
						}
        </div>
    `

	// Logika przenoszenia do akordeonu (zostaje bez zmian)
	const safeCat = category.replace('ą', 'a')
	const targetAccordion = document.getElementById(`db-${safeCat}`)
	if (targetAccordion) {
		const content = targetAccordion.querySelector('.category-content')
		if (card.parentElement !== content) content.appendChild(card)
		updateAllCounts()
	}
}

// --- LOGIKA TABELI ---

// Zmienne pomocnicze do przechowywania danych aktualnie wybranego posiłku
let currentMealData = null // Tu ląduje danie "w zawieszeniu"

function openMealModal(name, ingredients, recipe) {
	// Dodano recipe
	// Zapamiętujemy komplet danych, w tym przepis
	currentMealData = {
		name: name,
		ingredients: ingredients,
		recipe: recipe || '', // Zabezpieczenie przed brakiem danych
	}

	const modalTitle = document.querySelector('#meal-modal h3')
	if (modalTitle) modalTitle.innerText = `Dodaj: ${name}`

	document.getElementById('meal-modal').style.display = 'flex'
}

function handleModalSave(event) {
	if (event) event.preventDefault()

	// Szukamy elementów konkretnie wewnątrz diva #meal-modal
	const modal = document.getElementById('meal-modal')
	const daySelect = modal.querySelector('#modal-day-select')
	const categorySelect = modal.querySelector('#modal-category-select')

	if (!currentMealData) return

	const dayIndex = parseInt(daySelect.value)
	const selectedCategory = categorySelect.value
	const row = document.querySelector(`#mealTable tr[data-category="${selectedCategory}"]`)

	if (!row) {
		return
	}

	let cell
	// Logika dla Twojej tabeli (Obiad/Kolacja mają inne komórki przez colspan)
	if (selectedCategory === 'obiad' || selectedCategory === 'kolacja') {
		if (dayIndex === 1 || dayIndex === 2) cell = row.cells[1]
		else if (dayIndex === 3 || dayIndex === 4) cell = row.cells[2]
		else if (dayIndex === 5) cell = row.cells[3]
		else if (dayIndex === 6 || dayIndex === 7) cell = row.cells[4]
	} else {
		cell = row.cells[dayIndex]
	}

	if (cell) {
		// KLUCZOWE: Dodajemy currentMealData.recipe jako 4-ty argument
		fillTableCell(cell, currentMealData.name, currentMealData.ingredients, currentMealData.recipe)

		if (typeof saveTableToLocalStorage === 'function') saveTableToLocalStorage()
		closeModalBnt()
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

	// Zabezpieczamy tekst przed cudzysłowami
	const safeIng = ingredients.replace(/"/g, '&quot;')
	const safeRec = recipe.replace(/"/g, '&quot;')

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

openBtn.onclick = () => {
	editingCard = null
	modal.style.display = 'flex'
}

cancelBtn.onclick = () => {
	modal.style.display = 'none'
	mealForm.reset()
}

function closeModal() {
	modal.style.display = 'none'
	mealForm.reset()
	editingCard = null
}

function editMeal(card) {
	editingCard = card
	document.getElementById('modal-category-select').value = card.getAttribute('data-category')
	document.getElementById('mealNameInput').value = card.getAttribute('data-name')
	document.getElementById('ingredientsInput').value = card.getAttribute('data-ingredients')
	// DODAJ TO:
	document.getElementById('recipeInput').value = card.getAttribute('data-recipe')

	document.getElementById('modalOverlay').style.display = 'flex'
}

function deleteMeal(card) {
	const mealName = card.querySelector('.card-title')?.innerText

	if (confirm(`Czy na pewno usunąć "${mealName}" z bazy? Zostanie ono również usunięte z aktualnego jadłospisu.`)) {
		// 1. Usuwamy kartę z widoku bazy
		card.remove()

		// 2. Szukamy tego posiłku w tabeli jadłospisu i go usuwamy
		const allPlannedMeals = document.querySelectorAll('.meal-container')
		allPlannedMeals.forEach(container => {
			const plannedName = container.querySelector('.meal-name-text')?.innerText

			if (plannedName === mealName) {
				const cell = container.closest('td')
				if (cell) {
					setEmptyCell(cell) // Używamy Twojej funkcji do resetowania komórki
				}
			}
		})

		// 3. Zapisujemy zmiany w obu magazynach danych
		saveDatabaseToLocalStorage()
		saveTableToLocalStorage() // Zakładam, że tak nazywa się Twoja funkcja zapisu tabeli
		updateAllCounts()
	}
}

function togglePreview(btn) {
	const p = btn.closest('.meal-card').querySelector('.ingredients-preview')
	p.classList.toggle('active')
	btn.innerText = p.classList.contains('active') ? 'Ukryj' : 'Podgląd'
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
		// Domyślnie activeCat jest pusty ("wszystkie")
		listContainer.innerHTML = ''

		const cats = ['śniadanie', 'obiad', 'kolacja', 'przekąska', 'wszystkie']
		filterBar.innerHTML = ''

		cats.forEach(c => {
			const isAll = c === 'wszystkie'
			const isActive = (isAll && activeCat === '') || activeCat === c

			const b = document.createElement('button')
			b.innerText = c.toUpperCase()
			b.style.cssText = `padding:5px 12px; font-size:10px; cursor:pointer; border-radius:15px; border:1px solid #ddd; 
                               transition: all 0.2s;
                               background:${isActive ? '#4caf50' : '#fff'};
                               color:${isActive ? '#fff' : '#333'}`

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
			const mealRecipe = meal.recipe || ''
			item.className = 'meal-picker-item'
			item.innerHTML = `
                <span><strong>${meal.name}</strong></span>
                <small style="background:#eee; padding:2px 6px; border-radius:4px; font-size:10px;">${meal.category}</small>
            `
			item.onclick = () => {
				const mealRecipe = meal.recipe || '' // Pobieramy przepis z obiektu meal
				fillTableCell(currentTargetCell, meal.name, meal.ingredients, mealRecipe)
				saveTableToLocalStorage()
				closeMealPicker()
			}
			listContainer.appendChild(item)
		})
	}

	searchInput.value = ''
	// Przy wyszukiwaniu sprawdzamy, który przycisk jest aktualnie zielony, by zachować filtr kategorii
	searchInput.oninput = e => {
		const activeBtn = Array.from(filterBar.querySelectorAll('button')).find(
			b => b.style.backgroundColor === 'rgb(76, 175, 80)',
		)
		const currentCat = activeBtn && activeBtn.innerText !== 'WSZYSTKIE' ? activeBtn.innerText.toLowerCase() : ''
		renderList(e.target.value, currentCat)
	}

	// WYWOŁANIE: Zawsze zaczynamy od pustego filtra (opcja "wszystkie")
	renderList('', '')
	modalPicker.style.display = 'flex'
}

function closeMealPicker() {
	document.getElementById('mealPickerModal').style.display = 'none'
}

function closeShoppingList() {
	const shoppingSection = document.getElementById('shoppingListSection')
	if (shoppingSection) {
		shoppingSection.style.display = 'none'
	}
}

// --- GENEROWANIE LISTY ZAKUPÓW ---

document.addEventListener('DOMContentLoaded', () => {
	const generateListBtn = document.getElementById('generateListBtn')
	const shoppingContainer = document.getElementById('shoppingListContainer')
	const shoppingSection = document.getElementById('shoppingListSection')

	// --- FUNKCJA ODMIANY ---
	function getPolishForm(n, s1, s2, s3) {
		if (n === 1) return s1
		const n10 = n % 10
		const n100 = n % 100
		if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return s2
		return s3
	}

	// --- PARSER ---
	function parseIngredient(text) {
		text = text.toLowerCase().trim()
		const match = text.match(/^(\d+[\.,]?\d*)\s*(.*)/)
		let qty = 1
		let rest = text

		if (match) {
			qty = parseFloat(match[1].replace(',', '.'))
			rest = match[2].trim()
		}

		if (rest.includes('chleb') || rest.includes('kromk')) {
			return { qty, isBread: true, name: 'chleb' }
		}
		return { qty, isBread: false, name: rest }
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
				const { qty, isBread, name } = parseIngredient(item)
				const key = isBread ? 'BREAD_TOTAL' : name
				summary[key] = (summary[key] || 0) + qty
			})
		})

		const list = []
		Object.keys(summary).forEach(key => {
			let amount = Math.round(summary[key] * 100) / 100
			let htmlContent = ''
			let sortKey = '' // Dodajemy zmienną na klucz sortowania

			if (key === 'BREAD_TOTAL') {
				const totalSlices = Math.round(amount)
				const loaves = Math.floor(totalSlices / 20)
				const remainingSlices = totalSlices % 20

				// Ustawiamy klucz sortowania na "chleb", żeby był pod literą C
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
				// Dla reszty produktów klucz to po prostu ich nazwa
				sortKey = key
				htmlContent = `${key} <strong>${amount}</strong>`
			}

			list.push({
				label: htmlContent,
				sortKey: sortKey, // Używamy poprawnego klucza do sortowania
			})
		})

		// --- SORTOWANIE ALFABETYCZNE ---

		shoppingContainer.innerHTML = ''
		list.sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'pl'))

		list.forEach(item => {
			const el = document.createElement('div') // Zmieniono na div dla lepszej stabilności Drag&Drop
			el.className = 'shopping-item'
			el.draggable = true // Kluczowy atrybut
			el.innerHTML = `<input type="checkbox"> <span>${item.label}</span>`

			// Podpięcie zdarzeń
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
})

// Znajdujemy nowy przycisk
const refreshListBtn = document.getElementById('refreshListBtn')

// Przypisujemy mu tę samą funkcję, którą ma główny przycisk generowania
if (refreshListBtn) {
	refreshListBtn.onclick = () => {
		// Wywołujemy istniejącą logikę generowania (tę z alertem i sumowaniem)
		generateListBtn.click()

		// Opcjonalnie: mała informacja w konsoli lub wizualna, że odświeżono
		console.log('Lista zakupów została zaktualizowana!')
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

function closeShoppingList() {
	shoppingSection.style.display = 'none'
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
