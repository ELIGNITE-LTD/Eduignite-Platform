import json

from channels.generic.websocket import AsyncWebsocketConsumer

from .services import notification_group_name


class NotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.group_name = notification_group_name(user.id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def notification_created(self, event):
        await self.send(text_data=json.dumps({
            'type': 'notification.created',
            'notification': event['notification'],
            'unread_count': event['unread_count'],
        }))

    async def notification_read(self, event):
        await self.send(text_data=json.dumps({
            'type': 'notification.read',
            'notification_id': event.get('notification_id'),
            'unread_count': event['unread_count'],
        }))
