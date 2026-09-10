import { apiClient, storeUser } from "../client";
import { API } from "../endpoints";
import type { UpdateProfileRequest, User } from "../types";

/**
 * Profile self-service for the Companion app's own Profile screen — a small
 * slice of apps/mobile/src/lib/api/services/users.service.ts limited to
 * "read/update my own profile" (this app has no admin/roster views).
 *
 * GET/PATCH /users/me/ -> backend/apps/users/views.py UserViewSet.me(), which
 * returns UserDetailSerializer data (nested `school` incl. motto/logo) and,
 * on PATCH, validates against ProfileUpdateSerializer — only name, email,
 * phone, whatsapp, avatar are accepted; matricule is never writable.
 */
export const usersService = {
  async getMe(): Promise<User> {
    const { data } = await apiClient.get(API.USERS.ME);
    storeUser(data);
    return data;
  },

  async updateProfile(payload: UpdateProfileRequest): Promise<User> {
    const { data } = await apiClient.patch(API.USERS.ME, payload);
    storeUser(data);
    return data;
  },

  /**
   * POST /users/upload_avatar/, multipart field `avatar` — mirrors
   * apps/mobile's uploadAvatar. The backend stores the image as a data: URL
   * (see backend/apps/users/views.py upload_avatar -> image_to_data_url), not
   * a normal media URL, so the response's `avatar_url` is used as-is with no
   * media-URL resolution step.
   */
  async uploadAvatar(file: File): Promise<{ avatar_url: string }> {
    const formData = new FormData();
    formData.append("avatar", file);
    const { data } = await apiClient.post(API.USERS.UPLOAD_AVATAR, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },
};
