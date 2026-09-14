from datetime import date, timedelta

from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Board, Reservation, Unit, reservation_overlaps
from .serializers import BoardSerializer, ReservationSerializer, UnitSerializer

SEARCH_WINDOW_DAYS = 62


class BoardViewSet(viewsets.ModelViewSet):
    queryset = Board.objects.all()
    serializer_class = BoardSerializer

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        ids = request.data.get('order')
        if not isinstance(ids, list):
            return Response({'order': 'Must be a list of board ids.'}, status=400)

        boards = {b.id: b for b in Board.objects.filter(pk__in=ids)}
        updated = []
        for index, board_id in enumerate(ids):
            board = boards.get(board_id)
            if board is None:
                continue
            board.order = index
            updated.append(board)
        Board.objects.bulk_update(updated, ['order'])

        return Response(BoardSerializer(Board.objects.all(), many=True).data)


class UnitViewSet(viewsets.ModelViewSet):
    serializer_class = UnitSerializer

    def get_queryset(self):
        queryset = Unit.objects.all()
        board_id = self.request.query_params.get('board')
        if board_id:
            queryset = queryset.filter(board_id=board_id)
        return queryset

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        board_id = request.data.get('board')
        ids = request.data.get('order')
        if not board_id or not isinstance(ids, list):
            return Response({'order': 'board and a list of unit ids are required.'}, status=400)

        units = {u.id: u for u in Unit.objects.filter(pk__in=ids, board_id=board_id)}
        updated = []
        for index, unit_id in enumerate(ids):
            unit = units.get(unit_id)
            if unit is None:
                continue
            unit.order = index
            updated.append(unit)
        Unit.objects.bulk_update(updated, ['order'])

        return Response(UnitSerializer(Unit.objects.filter(board_id=board_id), many=True).data)


class ReservationViewSet(viewsets.ModelViewSet):
    serializer_class = ReservationSerializer

    def get_queryset(self):
        queryset = Reservation.objects.select_related('unit').prefetch_related('guests').all()

        board_id = self.request.query_params.get('board')
        if board_id:
            queryset = queryset.filter(board_id=board_id)

        if self.request.query_params.get('unassigned') == '1':
            queryset = queryset.filter(unit__isnull=True)

        search = self.request.query_params.get('search', '').strip()
        if search:
            today = date.today()
            window_from = today - timedelta(days=SEARCH_WINDOW_DAYS)
            window_to = today + timedelta(days=SEARCH_WINDOW_DAYS)
            queryset = queryset.filter(date_from__lte=window_to, date_to__gte=window_from)

            text_match = (
                Q(guests__first_name__icontains=search)
                | Q(guests__last_name__icontains=search)
                | Q(ref_number__icontains=search)
                | Q(notes_reception__icontains=search)
                | Q(notes_kitchen__icontains=search)
                | Q(notes_housekeeping__icontains=search)
                | Q(notes_system__icontains=search)
            )
            if search.isdigit():
                text_match |= Q(id=int(search))
            queryset = queryset.filter(text_match).distinct()
        else:
            date_from = self.request.query_params.get('from')
            date_to = self.request.query_params.get('to')
            if date_from and date_to:
                queryset = queryset.filter(date_from__lt=date_to, date_to__gt=date_from)

        return queryset

    @action(detail=True, methods=['post'])
    def link_board(self, request, pk=None):
        reservation = self.get_object()
        board_id = request.data.get('board')
        unit_id = request.data.get('unit')
        if not board_id:
            return Response({'board': 'This field is required.'}, status=400)

        existing = reservation.linked_reservations.filter(board_id=board_id).first()
        if existing:
            return Response(self.get_serializer(reservation).data)

        try:
            target_board = Board.objects.get(pk=board_id)
        except Board.DoesNotExist:
            return Response({'board': 'Board not found.'}, status=404)

        target_unit = None
        if unit_id:
            try:
                target_unit = Unit.objects.get(pk=unit_id, board=target_board)
            except Unit.DoesNotExist:
                return Response({'unit': 'Unit not found on that board.'}, status=404)

            if reservation_overlaps(
                target_unit.id, target_board, reservation.date_from, reservation.date_to,
                reservation.check_in_time, reservation.check_out_time,
            ):
                return Response({'unit': 'This unit is already booked for the selected dates.'}, status=400)

        linked = Reservation.objects.create(
            board=target_board,
            unit=target_unit,
            date_from=reservation.date_from,
            date_to=reservation.date_to,
            check_in_time=reservation.check_in_time,
            check_out_time=reservation.check_out_time,
            ref_number=reservation.ref_number,
            agency=reservation.agency,
        )
        for guest in reservation.guests.all():
            guest.pk = None
            guest.id = None
            guest.reservation = linked
            guest.save()

        reservation.linked_reservations.add(linked)

        return Response(self.get_serializer(reservation).data)

    @action(detail=True, methods=['post'])
    def unlink(self, request, pk=None):
        reservation = self.get_object()
        linked_id = request.data.get('reservation_id')
        try:
            linked = reservation.linked_reservations.get(pk=linked_id)
        except (Reservation.DoesNotExist, ValueError, TypeError):
            return Response({'reservation_id': 'Not linked.'}, status=404)

        reservation.linked_reservations.remove(linked)

        return Response(self.get_serializer(reservation).data)
