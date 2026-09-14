from django.contrib import admin

from .models import Board, Guest, Reservation, Unit


@admin.register(Board)
class BoardAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ('board', 'name', 'category', 'capacity', 'order')
    list_filter = ('board',)


class GuestInline(admin.TabularInline):
    model = Guest
    extra = 0
    fields = ('first_name', 'last_name', 'email', 'phone', 'document_type', 'document_number')


@admin.register(Guest)
class GuestAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'last_name', 'email', 'phone', 'reservation')
    search_fields = ('first_name', 'last_name', 'email')


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ('board', 'unit', 'status', 'date_from', 'date_to', 'agency', 'ref_number')
    list_filter = ('board', 'status')
    inlines = [GuestInline]
