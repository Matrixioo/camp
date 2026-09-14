from rest_framework.routers import DefaultRouter

from .views import BoardViewSet, ReservationViewSet, UnitViewSet

router = DefaultRouter()
router.register('boards', BoardViewSet, basename='board')
router.register('units', UnitViewSet, basename='unit')
router.register('reservations', ReservationViewSet, basename='reservation')

urlpatterns = router.urls
