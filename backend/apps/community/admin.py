from django.contrib import admin
from .models import Testimony, CommunityBlog, BlogComment


@admin.register(Testimony)
class TestimonyAdmin(admin.ModelAdmin):
    list_display = ['user', 'school_name', 'role_display', 'status', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['user__first_name', 'user__last_name', 'school_name', 'message']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(CommunityBlog)
class CommunityBlogAdmin(admin.ModelAdmin):
    list_display = ['title', 'author', 'is_published', 'view_count', 'created_at']
    list_filter = ['is_published', 'created_at', 'published_at']
    search_fields = ['title', 'author__first_name', 'author__last_name']
    readonly_fields = ['created_at', 'updated_at', 'slug', 'view_count']
    prepopulated_fields = {'slug': ('title',)}


@admin.register(BlogComment)
class BlogCommentAdmin(admin.ModelAdmin):
    list_display = ['blog', 'author', 'is_approved', 'created_at']
    list_filter = ['is_approved', 'created_at']
    search_fields = ['blog__title', 'author__first_name', 'author__last_name', 'content']
    readonly_fields = ['created_at', 'updated_at']
