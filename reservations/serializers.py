from rest_framework import serializers

from .models import Board, Guest, Reservation, Unit, reservation_overlaps


class BoardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Board
        fields = ['id', 'hotel', 'name', 'order', 'default_check_in_time', 'default_check_out_time', 'created_at']
        read_only_fields = ['id', 'hotel', 'created_at']


class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = ['id', 'board', 'name', 'category', 'capacity', 'order']


class GuestSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guest
        fields = [
            'id', 'first_name', 'last_name', 'email', 'phone',
            'date_of_birth', 'birth_country', 'birth_city',
            'residence_street', 'residence_building', 'residence_city',
            'residence_postal_code', 'residence_country',
            'document_type', 'document_number', 'document_country', 'visa_number',
        ]
        read_only_fields = ['id']


def _lead_guest_name(obj):
    for guest in obj.guests.all():
        name = f'{guest.first_name} {guest.last_name}'.strip()
        if name:
            return name
    if obj.contact_name:
        return obj.contact_name
    return 'Guest'


class LinkedReservationSerializer(serializers.ModelSerializer):
    board_name = serializers.CharField(source='board.name', read_only=True)
    unit_name = serializers.CharField(source='unit.name', read_only=True, default=None)
    lead_guest_name = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields = ['id', 'board', 'board_name', 'unit', 'unit_name', 'date_from', 'date_to', 'lead_guest_name', 'status']

    def get_lead_guest_name(self, obj):
        return _lead_guest_name(obj)


class ReservationSerializer(serializers.ModelSerializer):
    guests = GuestSerializer(many=True)
    lead_guest_name = serializers.SerializerMethodField()
    linked_reservations = LinkedReservationSerializer(many=True, read_only=True)

    class Meta:
        model = Reservation
        fields = [
            'id', 'board', 'unit', 'status', 'guests', 'lead_guest_name', 'date_from', 'date_to',
            'check_in_time', 'check_out_time',
            'ref_number', 'agency', 'contact_name',
            'notes_general', 'notes_reception', 'notes_kitchen', 'notes_housekeeping',
            'notes_system', 'notes_parking',
            'requested_category', 'linked_reservations', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'lead_guest_name', 'linked_reservations']

    def get_lead_guest_name(self, obj):
        return _lead_guest_name(obj)

    def validate(self, attrs):
        date_from = attrs.get('date_from', getattr(self.instance, 'date_from', None))
        date_to = attrs.get('date_to', getattr(self.instance, 'date_to', None))
        unit = attrs.get('unit', getattr(self.instance, 'unit', None))
        board = attrs.get('board', getattr(self.instance, 'board', None))
        check_in_time = attrs.get('check_in_time', getattr(self.instance, 'check_in_time', None))
        check_out_time = attrs.get('check_out_time', getattr(self.instance, 'check_out_time', None))

        if date_from and date_to and date_from > date_to:
            raise serializers.ValidationError({'date_to': 'Check-out date must not be before check-in date.'})

        if unit and board and unit.board_id != board.id:
            raise serializers.ValidationError({'unit': 'This unit does not belong to the selected board.'})

        if unit and board and date_from and date_to:
            exclude_pk = self.instance.pk if self.instance else None
            if reservation_overlaps(unit.id, board, date_from, date_to, check_in_time, check_out_time, exclude_pk=exclude_pk):
                raise serializers.ValidationError(
                    {'unit': 'This unit is already booked for the selected dates.'}
                )

        if 'guests' in attrs and not attrs['guests']:
            raise serializers.ValidationError({'guests': 'At least one guest is required.'})

        return attrs

    def create(self, validated_data):
        guests_data = validated_data.pop('guests')
        reservation = Reservation.objects.create(**validated_data)
        for guest_data in guests_data:
            Guest.objects.create(reservation=reservation, **guest_data)
        return reservation

    def update(self, instance, validated_data):
        guests_data = validated_data.pop('guests', None)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        if guests_data is not None:
            instance.guests.all().delete()
            for guest_data in guests_data:
                Guest.objects.create(reservation=instance, **guest_data)

        return instance
