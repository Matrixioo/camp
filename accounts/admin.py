from django.contrib import admin

from .models import Hotel, Membership


@admin.register(Hotel)
class HotelAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'hotel', 'role')
    list_filter = ('hotel', 'role')
