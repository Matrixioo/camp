from datetime import datetime, time

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q, F


def _combine(date_value, time_value, fallback_time):
    return datetime.combine(date_value, time_value or fallback_time)


def reservation_overlaps(unit_id, board, date_from, date_to, check_in_time, check_out_time, exclude_pk=None):
    new_check_in = _combine(date_from, check_in_time, board.default_check_in_time)
    new_check_out = _combine(date_to, check_out_time, board.default_check_out_time)

    candidates = Reservation.objects.filter(
        unit_id=unit_id,
        date_from__lte=date_to,
        date_to__gte=date_from,
    )
    if exclude_pk is not None:
        candidates = candidates.exclude(pk=exclude_pk)

    for other in candidates:
        other_check_in = _combine(other.date_from, other.check_in_time, board.default_check_in_time)
        other_check_out = _combine(other.date_to, other.check_out_time, board.default_check_out_time)
        if new_check_in < other_check_out and new_check_out > other_check_in:
            return True
    return False


class Board(models.Model):
    name = models.CharField(max_length=100)
    order = models.PositiveIntegerField(default=0)
    default_check_in_time = models.TimeField(default=time(14, 0))
    default_check_out_time = models.TimeField(default=time(11, 0))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.name


class Unit(models.Model):
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='units')
    name = models.CharField(max_length=50)
    category = models.CharField(max_length=100, blank=True)
    capacity = models.PositiveIntegerField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ('board', 'name')
        ordering = ['order', 'name']

    def __str__(self):
        return f'{self.board.name} / {self.name}'


class Reservation(models.Model):
    STATUS_CONFIRMED = 'confirmed'
    STATUS_CHECKED_IN = 'checked_in'
    STATUS_CHECKED_OUT = 'checked_out'
    STATUS_CHOICES = [
        (STATUS_CONFIRMED, 'Confirmed'),
        (STATUS_CHECKED_IN, 'Checked in'),
        (STATUS_CHECKED_OUT, 'Checked out'),
    ]

    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='reservations')
    unit = models.ForeignKey(
        Unit, on_delete=models.SET_NULL, related_name='reservations', null=True, blank=True
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_CONFIRMED)
    date_from = models.DateField()
    date_to = models.DateField()
    check_in_time = models.TimeField(null=True, blank=True)
    check_out_time = models.TimeField(null=True, blank=True)
    ref_number = models.CharField(max_length=100, blank=True)
    agency = models.CharField(max_length=100, blank=True)
    notes_general = models.TextField(blank=True)
    notes_reception = models.TextField(blank=True)
    notes_kitchen = models.TextField(blank=True)
    notes_housekeeping = models.TextField(blank=True)
    notes_system = models.TextField(blank=True)
    notes_parking = models.TextField(blank=True)
    requested_category = models.CharField(max_length=100, blank=True)
    linked_reservations = models.ManyToManyField('self', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=Q(date_to__gte=F('date_from')),
                name='reservation_date_to_after_date_from',
            ),
        ]

    def __str__(self):
        return f'Reservation #{self.pk} ({self.date_from} - {self.date_to})'

    def clean(self):
        if self.date_from and self.date_to and self.date_to < self.date_from:
            raise ValidationError('date_to must not be before date_from.')

        if self.unit_id and self.unit.board_id != self.board_id:
            raise ValidationError('Unit must belong to the same board as the reservation.')

        if self.unit_id and self.date_from and self.date_to:
            if reservation_overlaps(
                self.unit_id, self.board, self.date_from, self.date_to,
                self.check_in_time, self.check_out_time, exclude_pk=self.pk,
            ):
                raise ValidationError('This unit is already booked for the selected dates.')


class Guest(models.Model):
    DOCUMENT_PASSPORT = 'passport'
    DOCUMENT_ID_CARD = 'id_card'
    DOCUMENT_DRIVERS_LICENSE = 'drivers_license'
    DOCUMENT_TYPE_CHOICES = [
        (DOCUMENT_PASSPORT, 'Passport'),
        (DOCUMENT_ID_CARD, 'ID card'),
        (DOCUMENT_DRIVERS_LICENSE, "Driver's license"),
    ]

    reservation = models.ForeignKey(Reservation, on_delete=models.CASCADE, related_name='guests')

    first_name = models.CharField(max_length=255, blank=True)
    last_name = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)

    date_of_birth = models.DateField(null=True, blank=True)
    birth_country = models.CharField(max_length=100, blank=True)
    birth_city = models.CharField(max_length=100, blank=True)

    residence_street = models.CharField(max_length=255, blank=True)
    residence_building = models.CharField(max_length=50, blank=True)
    residence_city = models.CharField(max_length=100, blank=True)
    residence_postal_code = models.CharField(max_length=20, blank=True)
    residence_country = models.CharField(max_length=100, blank=True)

    document_type = models.CharField(max_length=20, choices=DOCUMENT_TYPE_CHOICES, blank=True)
    document_number = models.CharField(max_length=100, blank=True)
    document_country = models.CharField(max_length=100, blank=True)
    visa_number = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        name = f'{self.first_name} {self.last_name}'.strip()
        return name or f'Guest #{self.pk}'
