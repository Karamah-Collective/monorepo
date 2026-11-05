export type InstanceStatus = {
  hasUsers: boolean;
  hasAdmin: boolean;
};

export async function getInstanceStatus(): Promise<InstanceStatus> {
  // The upstream project exposes this public bootstrap check. Karamah
  // uses Firebase as the identity provider and the Admin API as the control
  // plane, so there is no separate instance bootstrap endpoint.
  return { hasUsers: true, hasAdmin: true };
}
