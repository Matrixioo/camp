from django.contrib.auth.models import User
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Hotel, Membership
from .permissions import require_role
from .serializers import (
    AddMemberSerializer,
    HotelSerializer,
    LoginSerializer,
    MembershipSerializer,
    RegisterSerializer,
    UserSerializer,
)


def _session_payload(user):
    token, _ = Token.objects.get_or_create(user=user)
    memberships = Membership.objects.filter(user=user).select_related('hotel')
    return {
        'token': token.key,
        'user': UserSerializer(user).data,
        'memberships': MembershipSerializer(memberships, many=True).data,
    }


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(_session_payload(user), status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(_session_payload(serializer.validated_data['user']))


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        memberships = Membership.objects.filter(user=request.user).select_related('hotel')
        return Response({
            'user': UserSerializer(request.user).data,
            'memberships': MembershipSerializer(memberships, many=True).data,
        })


class HotelViewSet(viewsets.ModelViewSet):
    serializer_class = HotelSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Hotel.objects.filter(memberships__user=self.request.user)

    def get_serializer_context(self):
        return {'request': self.request}

    def perform_create(self, serializer):
        hotel = serializer.save()
        Membership.objects.create(user=self.request.user, hotel=hotel, role=Membership.ROLE_OWNER)

    def perform_update(self, serializer):
        require_role(self.request.user, serializer.instance, Membership.ROLE_ADMIN)
        serializer.save()

    def perform_destroy(self, instance):
        require_role(self.request.user, instance, Membership.ROLE_OWNER)
        instance.delete()


class MembershipViewSet(viewsets.ModelViewSet):
    serializer_class = MembershipSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Membership.objects.filter(hotel__memberships__user=self.request.user).select_related('user', 'hotel')
        hotel_id = self.request.query_params.get('hotel')
        if hotel_id:
            queryset = queryset.filter(hotel_id=hotel_id)
        return queryset.distinct()

    def create(self, request, *args, **kwargs):
        hotel_id = request.data.get('hotel')
        if not hotel_id:
            raise ValidationError({'hotel': 'This field is required.'})
        hotel = Hotel.objects.filter(pk=hotel_id).first()
        if not hotel:
            raise ValidationError({'hotel': 'Hotel not found.'})

        add_serializer = AddMemberSerializer(data=request.data)
        add_serializer.is_valid(raise_exception=True)
        target_user = add_serializer.validated_data['email']
        role = add_serializer.validated_data['role']

        # Owners can grant admin or staff; admins can only grant staff.
        require_role(request.user, hotel, Membership.ROLE_ADMIN if role == Membership.ROLE_STAFF else Membership.ROLE_OWNER)

        membership, _ = Membership.objects.update_or_create(
            user=target_user, hotel=hotel, defaults={'role': role},
        )
        return Response(MembershipSerializer(membership).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        if instance.role == Membership.ROLE_OWNER:
            raise PermissionDenied('The owner cannot be removed.')
        min_role = Membership.ROLE_OWNER if instance.role == Membership.ROLE_ADMIN else Membership.ROLE_ADMIN
        require_role(self.request.user, instance.hotel, min_role)
        instance.delete()
