from rest_framework.exceptions import PermissionDenied

from .models import Membership


def get_membership(user, hotel):
    if not user or not user.is_authenticated or hotel is None:
        return None
    return Membership.objects.filter(user=user, hotel=hotel).first()


def has_role(user, hotel, min_role):
    membership = get_membership(user, hotel)
    if membership is None:
        return False
    return Membership.ROLE_RANK[membership.role] >= Membership.ROLE_RANK[min_role]


def require_role(user, hotel, min_role):
    if not has_role(user, hotel, min_role):
        raise PermissionDenied('You do not have permission to do that.')
