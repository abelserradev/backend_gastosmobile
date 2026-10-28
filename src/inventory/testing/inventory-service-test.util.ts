/** Mocks compartidos entre specs de inventario (misma forma que ProfileAccessService). */
export function createInventoryProfileAccessMock(profileId: string): {
  assertInventoryAccess: jest.Mock;
} {
  return {
    assertInventoryAccess: jest.fn().mockResolvedValue({
      access: 'owner',
      profile: { id: profileId, type: 'comercio' },
    }),
  };
}

export function createInventorySpecStubs(): {
  cache: { del: jest.Mock };
  audit: { recordDomainEvent: jest.Mock };
} {
  return {
    cache: { del: jest.fn().mockResolvedValue(undefined) },
    audit: { recordDomainEvent: jest.fn().mockResolvedValue(undefined) },
  };
}
