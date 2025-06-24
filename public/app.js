const form = document.getElementById('searchForm');
const queryInput = document.getElementById('query');
const statusEl = document.getElementById('status');
const table = document.getElementById('resultTable');
const tbody = table.querySelector('tbody');

// Pre-selected queries to help users
const suggestions = [
  'show me marriott properties in delhi with less than 30k points per night',
  'cheapest marriott redemption in hyderabad',
  'cost of westin Himalayas in points',
  'show me JW Marriott properties in Goa',
  'show me hotels in Chennai under 15000 points per night'
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
  table.style.display = 'none';

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
        <td>${row.AvgPtsNight.toLocaleString()}</td>
        <td>${row.AvgPts5Nights.toLocaleString()}</td>
      `;
      tbody.appendChild(tr);
    }
    table.style.display = data.length ? '' : 'none';
  } catch (err) {
    console.error(err);
    statusEl.textContent = err.message;
  }
}); 