import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProfileOwnershipService } from './profile-ownership.service';

describe('ProfileOwnershipService', () => {
  let service: ProfileOwnershipService;
  const prisma = {
    profile: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProfileOwnershipService(prisma as never);
  });

  it('debe retornar perfil cuando el usuario es dueño', async () => {
    const profile = { id: 'p1', userId: 'u1', type: 'comercio' as const };
    prisma.profile.findFirst.mockResolvedValue(profile);

    await expect(service.getOwnedProfile('p1', 'u1')).resolves.toEqual(profile);
  });

  it('debe lanzar ForbiddenException si el perfil no pertenece al usuario', async () => {
    prisma.profile.findFirst.mockResolvedValue(null);

    await expect(service.getOwnedProfile('p1', 'u2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('debe validar perfil comercio', async () => {
    prisma.profile.findUnique.mockResolvedValue({
      id: 'p1',
      type: 'comercio',
    });

    await expect(service.assertComercioProfile('p1')).resolves.toMatchObject({
      type: 'comercio',
    });
  });

  it('debe rechazar perfil no comercio', async () => {
    prisma.profile.findUnique.mockResolvedValue({
      id: 'p1',
      type: 'familiar',
    });

    await expect(service.assertComercioProfile('p1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('debe lanzar NotFoundException si el perfil no existe', async () => {
    prisma.profile.findUnique.mockResolvedValue(null);

    await expect(service.assertComercioProfile('p1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
