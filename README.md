# camp

camp is a reservation management platform for the hotel business. It
gives front-desk staff a broad toolkit for serving guests conveniently
and efficiently: a "rooms × dates" grid with drag-and-drop, guest
cards, check-in/check-out statuses, and separate panels for different
resource types (rooms, parking, etc.).

## Stack

- **Backend:** Python, Django, Django REST Framework, PostgreSQL, Docker
- **Frontend:** React, TypeScript, Vite

## Features

- Reservation grid: create, move, and resize bookings by dragging
- Unassigned reservations, check-in/check-out statuses, today's arrivals/departures list
- Guest card: documents, address, categorized notes
- Link a reservation to another board (e.g. room → parking)
- Reservation search, draggable board tabs and unit rows
- Django admin

## Getting started

### Backend

```
docker compose up -d
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

API — `http://127.0.0.1:8000/api/`, admin — `http://127.0.0.1:8000/admin/`.

### Frontend

```
cd frontend
npm install
npm run dev
```

App — `http://127.0.0.1:5173`. The backend must be running alongside it;
CORS is already configured for the Vite dev server.

## Roadmap

- Multi-language support
- Payment tracking
- Document management — attach files to reservations
- More advanced board/property settings
- Multi-property support (managing several hotels in one account)
- Availability view — free room counts by date/category
- ~~User accounts with roles (owner, admin, staff)~~ ☑️
- Full smart automation for creating/editing/deleting reservations via API requests
