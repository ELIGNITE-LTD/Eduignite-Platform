from rest_framework import serializers
from .models import Testimony, CommunityBlog, BlogComment


class AuthorSerializer(serializers.Serializer):
    """Minimal author representation embedded in blog/comment responses."""
    id = serializers.CharField(source='pk', read_only=True)
    name = serializers.SerializerMethodField()
    avatar = serializers.CharField(read_only=True, allow_blank=True, allow_null=True)
    role = serializers.CharField(read_only=True)

    def get_name(self, obj):
        return obj.get_full_name() or obj.email


class TestimonySerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    author = serializers.SerializerMethodField()
    content = serializers.CharField(source='message', read_only=True)

    class Meta:
        model = Testimony
        fields = ['id', 'user', 'author', 'school_name', 'role_display',
                  'message', 'content', 'rating', 'status', 'approved_at', 'created_at']

    def get_user(self, obj):
        return AuthorSerializer(obj.user).data

    def get_author(self, obj):
        return AuthorSerializer(obj.user).data


class TestimonyCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Testimony
        fields = ['school_name', 'role_display', 'message', 'rating']

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class BlogCommentSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    blog = serializers.PrimaryKeyRelatedField(queryset=CommunityBlog.objects.filter(is_published=True), write_only=True)
    blog_id = serializers.CharField(source='blog_id', read_only=True)

    class Meta:
        model = BlogComment
        fields = ['id', 'blog', 'blog_id', 'author', 'content', 'is_approved', 'created_at']
        read_only_fields = ['id', 'blog_id', 'author', 'is_approved', 'created_at']

    def get_author(self, obj):
        return AuthorSerializer(obj.author).data


class CommunityBlogListSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    like_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()
    liked_by_me = serializers.SerializerMethodField()

    class Meta:
        model = CommunityBlog
        fields = ['id', 'title', 'author', 'image', 'video_url', 'paragraphs', 'slug',
                  'view_count', 'created_at', 'is_published', 'like_count', 'comment_count',
                  'liked_by_me']

    def get_author(self, obj):
        return AuthorSerializer(obj.author).data

    def get_like_count(self, obj):
        return obj.likes.count()

    def get_comment_count(self, obj):
        return obj.comments.filter(is_approved=True).count()

    def get_liked_by_me(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return obj.likes.filter(user=request.user).exists()


class CommunityBlogDetailSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    comments = serializers.SerializerMethodField()
    like_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()
    liked_by_me = serializers.SerializerMethodField()

    class Meta:
        model = CommunityBlog
        fields = ['id', 'title', 'author', 'image', 'video_url', 'paragraphs', 'slug',
                  'view_count', 'is_published', 'published_at', 'created_at', 'comments',
                  'like_count', 'comment_count', 'liked_by_me']

    def get_author(self, obj):
        return AuthorSerializer(obj.author).data

    def get_comments(self, obj):
        comments = obj.comments.filter(is_approved=True)
        return BlogCommentSerializer(comments, many=True).data

    def get_like_count(self, obj):
        return obj.likes.count()

    def get_comment_count(self, obj):
        return obj.comments.filter(is_approved=True).count()

    def get_liked_by_me(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return obj.likes.filter(user=request.user).exists()


class CommunityBlogCreateSerializer(serializers.ModelSerializer):
    image = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    video_url = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = CommunityBlog
        fields = ['title', 'image', 'video_url', 'paragraphs']

    def validate(self, data):
        if not isinstance(data.get('paragraphs', []), list):
            raise serializers.ValidationError("paragraphs must be a list of strings")
        if not data.get('title', '').strip():
            raise serializers.ValidationError({'title': 'A strategic log title is required.'})
        data['paragraphs'] = [str(paragraph).strip() for paragraph in data.get('paragraphs', []) if str(paragraph).strip()]
        if not data['paragraphs']:
            raise serializers.ValidationError({'paragraphs': 'At least one content paragraph is required.'})
        return data

    def create(self, validated_data):
        validated_data['author'] = self.context['request'].user
        return super().create(validated_data)
