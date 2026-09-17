from rest_framework.routers import DefaultRouter

from django.urls import path

from .views import HotelViewSet, LoginView, LogoutView, MembershipViewSet, MeView, RegisterView

router = DefaultRouter()
router.register('hotels', HotelViewSet, basename='hotel')
router.register('members', MembershipViewSet, basename='membership')

urlpatterns = [
    path('auth/register/', RegisterView.as_view()),
    path('auth/login/', LoginView.as_view()),
    path('auth/logout/', LogoutView.as_view()),
    path('auth/me/', MeView.as_view()),
] + router.urls
