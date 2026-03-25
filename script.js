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
			// Wypełnij komórkę danymi z Firebase
			fillTableCell(cell, data[cell.id].name, data[cell.id].ingredients)
		} else {
			// Jeśli w chmurze pusto, ustaw przycisk "+"
			cell.innerHTML = `<button class="add-btn table-btn" onclick="openMealPicker(this)">+</button>`
			cell.style.padding = '5px' // Reset paddingu
		}
	})
})

// 2. ODBIERANIE BAZY DAŃ (TWOICH PRZEPISÓW)
// Nasłuchiwanie zmian w bazie dań
db.ref('mealDatabase').on('value', snapshot => {
	const data = snapshot.val() || []

	// 1. Czyścimy wszystkie akordeony, żeby załadować świeże dane
	document.querySelectorAll('.category-content').forEach(c => (c.innerHTML = ''))

	// 2. Dodajemy każde danie z Firebase do odpowiedniego akordeonu
	data.forEach(meal => {
		if (meal && meal.category) {
			// Używamy Twojej funkcji createNewMealCard
			// CZWARTY ARGUMENT MUSI BYĆ 'false', żeby nie zapętlić zapisu!
			createNewMealCard(meal.category, meal.name, meal.ingredients, false)
		}
	})

	// 3. Aktualizujemy też naszą zmienną globalną dla wyszukiwarki (Meal Picker)
	globalMealDatabase = data
})

// --- KONFIGURACJA I STATE ---
const modal = document.getElementById('modalOverlay')
const openBtn = document.getElementById('openFormBtn')
const cancelBtn = document.getElementById('cancelBtn')
const mealForm = document.getElementById('mealForm')
let editingCard = null

document.addEventListener('DOMContentLoaded', () => {
	initTheme()
	// 1. Wczytaj bazę posiłków
	const savedDatabase = JSON.parse(localStorage.getItem('myMealDatabase')) || []
	savedDatabase.forEach(meal => {
		if (meal && meal.category) {
			// Ujednolicenie kategorii przekąska (bez 'ą' w ID dla bezpieczeństwa)
			const safeCat = meal.category.replace('ą', 'a')
			createNewMealCard(safeCat, meal.name, meal.ingredients, false)
		}
	})

	// 2. Wczytaj jadłospis (tabelę)
	const savedTable = JSON.parse(localStorage.getItem('myWeeklyPlan')) || {}
	document.querySelectorAll('td[id]').forEach(cell => {
		if (savedTable[cell.id]) {
			const data = savedTable[cell.id]
			fillTableCell(cell, data.name, data.ingredients)
		} else {
			setEmptyCell(cell)
		}
	})

	// 1. Rozgrzewanie animacji przy najechaniu myszką (Hover)
	document.querySelectorAll('.category-accordion').forEach(acc => {
		acc.addEventListener(
			'mouseenter',
			() => {
				const wrapper = acc.querySelector('.category-wrapper')
				// Odczytujemy wysokość, gdy użytkownik tylko najeżdża myszką
				// To zmusza przeglądarkę do obliczeń ZANIM kliknie
				const forceLayout = wrapper.scrollHeight
			},
			{ once: true },
		) // Wykonaj tylko raz dla każdej kategorii
	})

	// 2. Całkowicie nowa obsługa otwierania (zastąp obsługę kliknięcia summary)
	document.querySelectorAll('.category-accordion summary').forEach(summary => {
		summary.addEventListener('click', e => {
			const details = e.target.parentElement
			const wrapper = details.querySelector('.category-wrapper')

			// Jeśli zamykamy (to już masz, ale upewnijmy się, że współgra)
			if (details.open) {
				e.preventDefault()
				details.classList.add('closing')
				setTimeout(() => {
					details.open = false
					details.classList.remove('closing')
				}, 400)
			} else {
				// Jeśli OTWIERAMY:
				// Wymuszamy przeliczenie wysokości kart posiłków przed otwarciem
				const preCalculation = wrapper.scrollHeight
			}
		})
	})
})

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
			}
		}
	})
	// Zapis do Chmury
	db.ref('weeklyPlan').set(tableData)
}

// --- LOGIKA BAZY POSIŁKÓW ---

mealForm.onsubmit = e => {
	e.preventDefault()
	const category = document.getElementById('modal-category-select').value
	const name = document.getElementById('mealNameInput').value
	const ingredients = document.getElementById('ingredientsInput').value

	if (editingCard) {
		updateMealCard(editingCard, category, name, ingredients)
	} else {
		createNewMealCard(category, name, ingredients, true)
	}

	saveDatabaseToLocalStorage()
	closeModal()
}

function createNewMealCard(category, name, ingredients, shouldSave) {
	const safeCat = category.replace('ą', 'a') // db-przekąska -> db-przekaska
	const accordion = document.getElementById(`db-${safeCat}`)
	if (!accordion) return

	const targetSection = accordion.querySelector('.category-content')
	const mealCard = document.createElement('div')
	mealCard.className = 'meal-card'

	updateMealCard(mealCard, category, name, ingredients)
	targetSection.appendChild(mealCard)

	if (shouldSave) saveDatabaseToLocalStorage()
}

function updateMealCard(card, category, name, ingredients) {
	const safeName = (name || 'Bez nazwy').toString()
	const safeIngredients = (ingredients || '').toString()

	card.setAttribute('data-name', safeName)
	card.setAttribute('data-ingredients', safeIngredients)
	card.setAttribute('data-category', category)

	card.innerHTML = `
        <div class="meal-info-container">
            <strong class="card-title" style="display: block; color: #2c3e50; font-size: 1.1em;">
                ${safeName}
            </strong>
        </div>
        
        <div class="card-actions">
          <button onclick="openMealModal('${safeName.replace(/'/g, "\\'")}', '${safeIngredients.replace(/'/g, "\\'")}')">
            Dodaj +
        </button>
            <button class="btn-preview" onclick="togglePreview(this)">Podgląd</button>
            <button onclick="editMeal(this.parentElement.parentElement)" style="background: #f39c12;">Edytuj</button>
            <button onclick="deleteMeal(this.parentElement.parentElement)" style="background: #e74c3c;">Usuń</button>
        </div>

        <div class="ingredients-preview">
            <small style="line-height: 1.4;">${safeIngredients}</small>
        </div>
    `

	// Logika przenoszenia do akordeonu (zostaje bez zmian)
	const safeCat = category.replace('ą', 'a')
	const targetAccordion = document.getElementById(`db-${safeCat}`)
	if (targetAccordion) {
		const content = targetAccordion.querySelector('.category-content')
		if (card.parentElement !== content) content.appendChild(card)
	}
}

// --- LOGIKA TABELI ---

// Zmienne pomocnicze do przechowywania danych aktualnie wybranego posiłku
let currentMealData = null // Tu ląduje danie "w zawieszeniu"

function openMealModal(name, ingredients) {
	// 1. Zapamiętujemy, co kliknęliśmy
	currentMealData = {
		name: name,
		ingredients: ingredients,
	}

	// 2. Opcjonalnie: wpisz nazwę dania do nagłówka modala, żebyś wiedział co dodajesz
	const modalTitle = document.querySelector('#meal-modal h3')
	if (modalTitle) modalTitle.innerText = `Dodaj: ${name}`

	// 3. Pokaż modal
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
	const selectedCategory = categorySelect.value // Pobiera aktualnie wybraną opcję

	// Szukamy wiersza w tabeli
	const row = document.querySelector(`#mealTable tr[data-category="${selectedCategory}"]`)

	if (!row) {
		console.error('Błąd: Nie znaleziono wiersza dla:', selectedCategory)
		alert('Błąd: Tabela nie posiada kategorii: ' + selectedCategory)
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
		fillTableCell(cell, currentMealData.name, currentMealData.ingredients)
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

function fillTableCell(cell, name, ingredients) {
	cell.style.position = 'relative'
	cell.style.verticalAlign = 'center'
	// Dodajemy padding, żeby tekst nie nachodził na przycisk usuwania
	cell.style.padding = '23px 5px 5px 5px'

	cell.innerHTML = `
        <div class="meal-container" data-ingredients="${ingredients.replace(/"/g, '&quot;')}">
		 <button class="info-btn table-btn" onclick="showMealInfo(this)" title="Pokaż składniki">i</button>
            <button class="delete-btn table-btn" onclick="clearCell(this)">&times;</button>
            <div class="meal-name-text" style="font-size: 0.85em; font-weight: bold;">${name}</div>
        </div>
    `
}

function showMealInfo(btn) {
	const container = btn.closest('.meal-container')
	const name = container.querySelector('.meal-name-text').innerText
	const ingredients = container.getAttribute('data-ingredients')

	const modal = document.getElementById('infoModal')
	const title = document.getElementById('infoModalTitle')
	const content = document.getElementById('infoModalContent')

	title.innerText = name

	// Formułujemy listę składników z kropek
	const ingredientsList = ingredients
		.split(',')
		.map(item => `• ${item.trim()}`)
		.join('<br>')

	content.innerHTML = `<div style="text-align: left; padding: 10px;">${ingredientsList}</div>`

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
	modal.style.display = 'flex'
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
	}
}

function togglePreview(btn) {
	const p = btn.closest('.meal-card').querySelector('.ingredients-preview')
	p.classList.toggle('active')
	btn.innerText = p.classList.contains('active') ? 'Ukryj' : 'Podgląd'
}

// --- GENEROWANIE LISTY ZAKUPÓW ---

const generateListBtn = document.getElementById('generateListBtn')
const shoppingContainer = document.getElementById('shoppingListContainer')
const shoppingSection = document.getElementById('shoppingListSection')

generateListBtn.onclick = () => {
	const plannedMeals = document.querySelectorAll('td div[data-ingredients]')
	const summary = {}
	plannedMeals.forEach(meal => {
		const items = meal
			.getAttribute('data-ingredients')
			.split(',')
			.map(i => i.trim())
		items.forEach(item => {
			const match = item.match(/^(\d+[\.,]?\d*)\s*(.*)/)
			if (match) {
				let qty = parseFloat(match[1].replace(',', '.'))
				let prod = match[2].trim().toLowerCase()
				summary[prod] = (summary[prod] || 0) + qty
			} else {
				summary[item.toLowerCase()] = (summary[item.toLowerCase()] || 0) + 1
			}
		})
	})

	const sorted = Object.keys(summary).sort((a, b) => a.localeCompare(b, 'pl'))
	shoppingContainer.innerHTML = ''
	sorted.forEach(p => {
		const amount = Math.round(summary[p] * 100) / 100
		const lbl = document.createElement('label')
		lbl.className = 'shopping-item'
		lbl.innerHTML = `<input type="checkbox"> <strong>${amount}</strong> <span>${p}</span>`
		shoppingContainer.appendChild(lbl)
	})
	shoppingSection.style.display = 'block'
	shoppingSection.scrollIntoView({ behavior: 'smooth' })
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
			item.className = 'meal-picker-item'
			item.innerHTML = `
                <span><strong>${meal.name}</strong></span>
                <small style="background:#eee; padding:2px 6px; border-radius:4px; font-size:10px;">${meal.category}</small>
            `
			item.onclick = () => {
				fillTableCell(currentTargetCell, meal.name, meal.ingredients)
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

// --- LISTA ZAKUPÓW I DRUKOWANIE ---

generateListBtn.onclick = () => {
	const plannedMeals = document.querySelectorAll('td div[data-ingredients]')
	const summary = {}

	plannedMeals.forEach(meal => {
		const ingredientsData = meal.getAttribute('data-ingredients')
		if (!ingredientsData) return

		const items = ingredientsData.split(',').map(i => i.trim())
		items.forEach(item => {
			const match = item.match(/^(\d+[\.,]?\d*)\s*(.*)/)
			if (match) {
				let qty = parseFloat(match[1].replace(',', '.'))
				let prod = match[2].trim().toLowerCase()
				if (prod) {
					summary[prod] = (summary[prod] || 0) + qty
				}
			} else if (item) {
				const prod = item.trim().toLowerCase()
				summary[prod] = (summary[prod] || 0) + 1
			}
		})
	})

	const sorted = Object.keys(summary).sort((a, b) => a.localeCompare(b, 'pl'))

	// --- NOWA LOGIKA: Sprawdzanie czy lista jest pusta ---
	if (sorted.length === 0) {
		alert('Twój jadłospis jest pusty! Dodaj posiłki do tabeli, aby wygenerować listę zakupów.')
		shoppingSection.style.display = 'none' // Ukrywamy sekcję, jeśli była widoczna
		return // Przerywamy funkcję tutaj
	}
	// ----------------------------------------------------

	shoppingContainer.innerHTML = ''
	sorted.forEach(p => {
		const amount = Math.round(summary[p] * 100) / 100
		const lbl = document.createElement('label')
		lbl.className = 'shopping-item'
		// Usunąłem style inline, aby CSS z Dark Mode mógł swobodnie działać
		lbl.innerHTML = `<input type="checkbox"> <strong>${amount}</strong> <span>${p}</span>`
		shoppingContainer.appendChild(lbl)
	})

	shoppingSection.style.display = 'block'
	shoppingSection.scrollIntoView({ behavior: 'smooth' })
}

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
	const savedDatabase = JSON.parse(localStorage.getItem('myMealDatabase')) || []

	if (savedDatabase.length === 0) {
		alert('Twoja baza jest pusta. Nie ma czego eksportować!')
		return
	}

	const dataStr = JSON.stringify(savedDatabase, null, 2)
	const blob = new Blob([dataStr], { type: 'application/json' })
	const url = URL.createObjectURL(blob)

	const link = document.createElement('a')
	link.href = url
	link.download = `Moja_Baza_Posilkow_${new Date().toISOString().slice(0, 10)}.json`
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
	reader.onload = function (e) {
		try {
			const importedData = JSON.parse(e.target.result)

			if (!Array.isArray(importedData)) {
				throw new Error('Nieprawidłowy format pliku.')
			}

			const currentDb = JSON.parse(localStorage.getItem('myMealDatabase')) || []

			// FILTR: Szukamy dań, których nazwa (małymi literami) nie istnieje jeszcze w bazie
			const existingNames = new Set(currentDb.map(m => m.name.toLowerCase().trim()))

			const newMeals = importedData.filter(m => {
				const isDuplicate = existingNames.has(m.name.toLowerCase().trim())
				return !isDuplicate
			})

			if (newMeals.length === 0) {
				alert('Wszystkie dania z pliku znajdują się już w Twojej bazie!')
				event.target.value = '' // Reset inputu
				return
			}

			const message =
				`Znaleziono ${importedData.length} posiłków.\n` +
				`- Nowe do dodania: ${newMeals.length}\n` +
				`- Pominięte duplikaty: ${importedData.length - newMeals.length}\n\n` +
				`Czy chcesz kontynuować?`

			if (confirm(message)) {
				const finalDb = [...currentDb, ...newMeals]
				localStorage.setItem('myMealDatabase', JSON.stringify(finalDb))
				alert('Import zakończony! Baza została zaktualizowana.')
				location.reload()
			}
		} catch (err) {
			alert('Błąd podczas importu: ' + err.message)
		}
		event.target.value = '' // Reset inputu po zakończeniu
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
