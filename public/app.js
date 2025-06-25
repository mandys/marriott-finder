const form = document.getElementById('searchForm');
const queryInput = document.getElementById('query');
const statusEl = document.getElementById('status');
const table = document.getElementById('resultTable');
const tbody = table.querySelector('tbody');
const cardsContainer = document.getElementById('resultCards');

// Pre-selected queries to help users
const suggestions = [
  'show me marriott properties in delhi with less than 30k points per night',
  'cheapest marriott redemption in hyderabad',
  'cost of westin Himalayas in points',
  'show me JW Marriott properties in Goa',
  'show me hotels in Chennai under 15000 points per night',
  'cheapest marriott redemption in karnataka',
  'show me marriott hotels in telangana under 30000 points',
  'westin properties in rajasthan',
  'marriott hotels within 10 km of airport in hyderabad',
  'cheapest redemption in delhi within 19 km of airport',
  'jw marriott under 35km from airport in goa',
  'hotels nearest to bengaluru airport'
];

const suggestionsContainer = document.getElementById('suggestions');

suggestions.forEach(text => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm btn-outline-secondary';
  btn.textContent = text;
  btn.addEventListener('click', () => {
    queryInput.value = text;
    form.requestSubmit();
  });
  suggestionsContainer.appendChild(btn);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = queryInput.value.trim();
  if (!query) return;

  statusEl.textContent = 'Thinking…';
  tbody.innerHTML = '';
  cardsContainer.innerHTML = '';

  try {
    const res = await fetch('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Server error');
    }
    const { count, data } = await res.json();
    statusEl.textContent = `${count} result${count === 1 ? '' : 's'} found`;

    for (const row of data) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.Brand}</td>
        <td>${row.Hotel}</td>
        <td>${row.City}</td>
        <td>${row.State}</td>
        <td>${row.DistanceKmFromAirport ? row.DistanceKmFromAirport.toFixed(1) : ''}</td>
        <td>${row.AvgPtsNight.toLocaleString()}</td>
        <td>${row.AvgPts5Nights.toLocaleString()}</td>
      `;
      tbody.appendChild(tr);

      // Mobile card
      const card = document.createElement('div');
      card.className = 'card mb-3 shadow-sm';
      card.innerHTML = `
        <div class="card-body p-3">
          <h6 class="card-title mb-1">${row.Hotel}</h6>
          <p class="card-subtitle text-muted mb-2 small">${row.Brand} • ${row.City}, ${row.State}</p>
          <div class="d-flex justify-content-between small">
            <span><i class="fa-solid fa-plane"></i> ${row.DistanceKmFromAirport ? row.DistanceKmFromAirport.toFixed(1) + ' km' : '—'}</span>
            <span><strong>${row.AvgPtsNight.toLocaleString()}</strong> pts / night</span>
          </div>
        </div>`;
      cardsContainer.appendChild(card);
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = err.message;
  }
}); 