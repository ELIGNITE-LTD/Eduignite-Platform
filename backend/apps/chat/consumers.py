import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken
from apps.users.models import User
from .models import Conversation, Message, ConversationParticipant

logger = logging.getLogger(__name__)


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.conversation_id = self.scope['url_route']['kwargs']['conversation_id']
        self.group_name = f'chat_{self.conversation_id}'
        self.user = None
        self.participant = None

        # Authenticate user
        try:
            self.user = await self.get_user_from_token()
        except Exception as e:
            logger.error(f"Authentication failed: {e}")
            await self.close(code=4001)
            return

        # Verify user is a participant
        try:
            self.participant = await self.get_participant()
        except Exception as e:
            logger.error(f"User is not a participant: {e}")
            await self.close(code=4002)
            return

        # Join group
        await self.channel_layer.group_add(self.group_name, self.channel_name)

        # Mark as online
        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'user_status',
                'user_id': str(self.user.id),
                'user_name': self.user.get_full_name(),
                'status': 'online',
                'timestamp': timezone.now().isoformat()
            }
        )

        await self.accept()

    async def disconnect(self, close_code):
        if self.group_name:
            # Mark as offline
            if self.user:
                await self.channel_layer.group_send(
                    self.group_name,
                    {
                        'type': 'user_status',
                        'user_id': str(self.user.id),
                        'user_name': self.user.get_full_name(),
                        'status': 'offline',
                        'timestamp': timezone.now().isoformat()
                    }
                )

            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message_type = data.get('type', 'message')

            if message_type == 'message':
                await self.handle_message(data)
            elif message_type == 'typing':
                await self.handle_typing(data)
            elif message_type == 'read':
                await self.handle_read(data)
            else:
                logger.warning(f"Unknown message type: {message_type}")

        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                'error': 'Invalid JSON'
            }))
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            await self.send(text_data=json.dumps({
                'error': str(e)
            }))

    async def handle_message(self, data):
        """Handle incoming chat message."""
        text = data.get('text', '').strip()
        message_type = data.get('message_type', 'text')
        reply_to_id = data.get('reply_to')
        client_temp_id = data.get('client_temp_id')

        if not text:
            await self.send(text_data=json.dumps({
                'error': 'Message text cannot be empty'
            }))
            return

        try:
            message = await self.save_message(
                conversation_id=self.conversation_id,
                sender=self.user,
                text=text,
                message_type=message_type,
                reply_to_id=reply_to_id
            )

            # Broadcast message to group
            await self.channel_layer.group_send(
                self.group_name,
                {
                    'type': 'chat_message',
                    'message': {
                        'id': str(message.id),
                        'sender_id': str(message.sender.id),
                        'sender_name': message.sender.name,
                        'sender_avatar': message.sender.avatar or None,
                        'text': message.text,
                        'message_type': message.message_type,
                        'is_official': message.is_official,
                        'created_at': message.created_at.isoformat(),
                        'reply_to': str(message.reply_to_id) if message.reply_to_id else None,
                        'conversation_id': str(self.conversation_id),
                        'client_temp_id': client_temp_id,
                    }
                }
            )

            # Update conversation last_message
            await self.update_conversation_last_message(
                conversation_id=self.conversation_id,
                message_text=text
            )

        except Exception as e:
            logger.error(f"Error saving message: {e}")
            await self.send(text_data=json.dumps({
                'error': 'Failed to send message'
            }))

    async def handle_typing(self, data):
        """Handle typing indicator."""
        is_typing = data.get('is_typing', False)

        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'typing_indicator',
                'user_id': str(self.user.id),
                'user_name': self.user.get_full_name(),
                'is_typing': is_typing
            }
        )

    async def handle_read(self, data):
        """Handle mark as read."""
        message_ids = data.get('message_ids', [])

        try:
            await self.mark_messages_as_read(message_ids)

            await self.channel_layer.group_send(
                self.group_name,
                {
                    'type': 'message_read',
                    'user_id': str(self.user.id),
                    'message_ids': [str(message_id) for message_id in message_ids],
                    'read_at': timezone.now().isoformat()
                }
            )

            # Update participant last_read_at
            await self.update_participant_last_read()

        except Exception as e:
            logger.error(f"Error marking messages as read: {e}")

    async def chat_message(self, event):
        """Send message to WebSocket."""
        await self.send(text_data=json.dumps({
            'type': 'message',
            'data': event['message']
        }))

    async def typing_indicator(self, event):
        """Broadcast typing indicator."""
        await self.send(text_data=json.dumps({
            'type': 'typing',
            'user_id': event['user_id'],
            'user_name': event['user_name'],
            'is_typing': event['is_typing']
        }))

    async def user_status(self, event):
        """Broadcast user status."""
        await self.send(text_data=json.dumps({
            'type': 'user_status',
            'user_id': event['user_id'],
            'user_name': event['user_name'],
            'status': event['status'],
            'timestamp': event['timestamp']
        }))

    async def message_read(self, event):
        """Broadcast message read status."""
        await self.send(text_data=json.dumps({
            'type': 'message_read',
            'user_id': event['user_id'],
            'message_ids': event['message_ids'],
            'read_at': event['read_at']
        }))

    # Helper methods
    async def get_user_from_token(self):
        """Extract and validate user from JWT token."""
        token_str = None

        # Try to get token from query params or headers
        query_string = self.scope.get('query_string', b'').decode()
        if 'token=' in query_string:
            token_str = query_string.split('token=')[1].split('&')[0]

        if not token_str:
            headers = dict(self.scope.get('headers', []))
            auth_header = headers.get(b'authorization', b'').decode()
            if auth_header.startswith('Bearer '):
                token_str = auth_header[7:]

        if not token_str:
            raise InvalidToken('No token provided')

        try:
            token = AccessToken(token_str)
            user_id = token.get('user_id')
            user = await database_sync_to_async(User.objects.get)(id=user_id)
            return user
        except Exception as e:
            raise InvalidToken(f'Invalid token: {e}')

    @database_sync_to_async
    def get_participant(self):
        """Get conversation participant for current user."""
        return ConversationParticipant.objects.select_related('user', 'conversation').get(
            conversation_id=self.conversation_id,
            user=self.user
        )

    @database_sync_to_async
    def save_message(self, conversation_id, sender, text, message_type, reply_to_id=None):
        """Save message to database."""
        conversation = Conversation.objects.get(id=conversation_id)
        reply_to = None

        if reply_to_id:
            try:
                reply_to = Message.objects.get(id=reply_to_id)
            except Message.DoesNotExist:
                pass

        message = Message.objects.create(
            conversation=conversation,
            sender=sender,
            text=text,
            message_type=message_type,
            reply_to=reply_to
        )

        return message

    @database_sync_to_async
    def update_conversation_last_message(self, conversation_id, message_text):
        """Update conversation's last message cache."""
        Conversation.objects.filter(id=conversation_id).update(
            last_message=message_text[:100],
            last_message_at=timezone.now()
        )

    @database_sync_to_async
    def mark_messages_as_read(self, message_ids):
        """Mark messages as read."""
        Message.objects.filter(
            id__in=message_ids,
            is_deleted=False
        ).update(
            is_read=True,
            read_at=timezone.now()
        )

    @database_sync_to_async
    def update_participant_last_read(self):
        """Update participant's last_read_at timestamp."""
        ConversationParticipant.objects.filter(
            conversation_id=self.conversation_id,
            user=self.user
        ).update(last_read_at=timezone.now())
