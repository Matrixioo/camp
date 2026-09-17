from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError

from accounts.models import Hotel, Membership
from reservations.models import Board


class Command(BaseCommand):
    help = "Create (or reuse) a hotel, make the given user its owner, and attach any board that doesn't belong to a hotel yet."

    def add_arguments(self, parser):
        parser.add_argument('username')
        parser.add_argument('--hotel-name', default='Test Hotel')

    def handle(self, username, hotel_name, **options):
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise CommandError(f'No user named "{username}". Run createsuperuser or register first.')

        hotel, created = Hotel.objects.get_or_create(name=hotel_name)
        membership, created_membership = Membership.objects.update_or_create(
            user=user, hotel=hotel, defaults={'role': Membership.ROLE_OWNER},
        )

        orphaned = Board.objects.filter(hotel__isnull=True)
        attached = orphaned.count()
        orphaned.update(hotel=hotel)

        self.stdout.write(self.style.SUCCESS(
            f'"{hotel.name}" (id={hotel.id}) — {username} is now owner. '
            f'{attached} board(s) attached.'
        ))
