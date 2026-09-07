import { apiClient } from "../client";
import { API } from "../endpoints";
import type {
  OfflineLicensingChallenge,
  OfflineLicensingRedeemResponse,
} from "@/lib/offline-licensing/types";

/**
 * Ported from apps/mobile/src/lib/api/services/offline-licensing.service.ts.
 * Companion side of the wire contract (wave2-contract.md): the technician
 * scans the JSON challenge shown on the offline desktop's QR code and this
 * relays it, unmodified, to the backend using the technician's normal auth
 * token. The backend validates expiry/anti-replay/authorization and returns
 * a signed License Certificate.
 */
export const offlineLicensingService = {
  /** Redeems an "activation" or "renewal" challenge. */
  async redeemChallenge(challenge: OfflineLicensingChallenge): Promise<OfflineLicensingRedeemResponse> {
    const { data } = await apiClient.post(API.OFFLINE_LICENSING.REDEEM, challenge);
    return data;
  },

  /** Redeems a "device_replacement" challenge (carries `previousDeviceId`). */
  async redeemDeviceReplacement(challenge: OfflineLicensingChallenge): Promise<OfflineLicensingRedeemResponse> {
    const { data } = await apiClient.post(API.OFFLINE_LICENSING.DEVICE_REPLACEMENT, challenge);
    return data;
  },

  /** Routes to the correct endpoint based on the challenge's own `purpose`. */
  async redeem(challenge: OfflineLicensingChallenge): Promise<OfflineLicensingRedeemResponse> {
    if (challenge.purpose === "device_replacement") {
      return this.redeemDeviceReplacement(challenge);
    }
    return this.redeemChallenge(challenge);
  },
};
