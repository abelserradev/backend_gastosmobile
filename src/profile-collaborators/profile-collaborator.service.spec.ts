import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProfileCollaboratorService } from './profile-collaborator.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { ProfileAccessService } from '../common/services/profile-access.service';
import { ProfileOwnershipService } from '../common/services/profile-ownership.service';

const mockPrisma = () => ({
  profile: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
  },
  profileCollaborator: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
  },
});

const mockCache = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
});

const mockProfileOwnership = () => ({
  assertOwnedComercioProfile: jest.fn(),
});

describe('ProfileCollaboratorService', () => {
  let service: ProfileCollaboratorService;
  let prisma: ReturnType<typeof mockPrisma>;
  let cache: ReturnType<typeof mockCache>;
  let ownership: ReturnType<typeof mockProfileOwnership>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileCollaboratorService,
        { provide: PrismaService, useValue: mockPrisma() },
        { provide: CacheService, useValue: mockCache() },
        { provide: ProfileAccessService, useValue: {} },
        { provide: ProfileOwnershipService, useValue: mockProfileOwnership() },
      ],
    }).compile();

    service = module.get<ProfileCollaboratorService>(
      ProfileCollaboratorService,
    );
    prisma = module.get(PrismaService);
    cache = module.get(CacheService);
    ownership = module.get(ProfileOwnershipService);
    jest.clearAllMocks();
  });

  describe('listProfilesForUser', () => {
    it('debe retornar desde caché si hay hit', async () => {
      const cached = [
        { id: 'p1', name: 'Personal', type: 'familiar', access: 'owner' },
      ];
      cache.get.mockResolvedValueOnce(cached);

      const result = await service.listProfilesForUser('u1');

      expect(result).toEqual(cached);
      expect(prisma.profile.findMany).not.toHaveBeenCalled();
    });

    it('debe cargar desde Prisma y guardar en caché si hay miss', async () => {
      cache.get.mockResolvedValueOnce(null);
      prisma.profile.findMany.mockResolvedValueOnce([
        { id: 'p1', name: 'Personal', type: 'familiar' },
      ]);
      prisma.profileCollaborator.findMany.mockResolvedValueOnce([]);

      const result = await service.listProfilesForUser('u1');

      expect(result).toEqual([
        { id: 'p1', name: 'Personal', type: 'familiar', access: 'owner' },
      ]);
      expect(cache.set.mock.calls).toEqual([
        [
          'me:profiles:u1',
          [{ id: 'p1', name: 'Personal', type: 'familiar', access: 'owner' }],
          60_000,
        ],
      ]);
    });

    it('debe cargar desde Prisma si caché retorna null', async () => {
      cache.get.mockResolvedValueOnce(null);
      prisma.profile.findMany.mockResolvedValueOnce([]);
      prisma.profileCollaborator.findMany.mockResolvedValueOnce([]);

      const result = await service.listProfilesForUser('u1');

      expect(result).toEqual([]);
      expect(cache.set).toHaveBeenCalled();
    });
  });

  describe('invalidación de perfiles', () => {
    it('invite invalida listas del dueño y del invitado', async () => {
      ownership.assertOwnedComercioProfile.mockResolvedValue({
        id: 'p1',
      });
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'u2',
        email: 'u2@test.com',
      });
      prisma.profileCollaborator.findUnique.mockResolvedValueOnce(null);
      prisma.profileCollaborator.create.mockResolvedValueOnce({
        id: 'c1',
        profileId: 'p1',
        userId: 'u2',
        invitedById: 'u1',
        status: 'pending',
        role: 'editor',
        createdAt: new Date(),
        acceptedAt: null,
        profile: { name: 'Comercio' },
        user: { email: 'u2@test.com', name: 'User 2' },
      });

      await service.invite('p1', 'u1', {
        email: 'u2@test.com',
      });

      expect(cache.del.mock.calls).toEqual([
        ['me:profiles:u1'],
        ['me:profiles:u2'],
      ]);
    });

    it('acceptInvitation invalida listas del invitado y del dueño', async () => {
      prisma.profileCollaborator.findFirst.mockResolvedValueOnce({
        id: 'c1',
        profileId: 'p1',
        userId: 'u2',
        invitedById: 'u1',
        status: 'pending',
      });
      prisma.profileCollaborator.update.mockResolvedValueOnce({
        id: 'c1',
        profileId: 'p1',
        userId: 'u2',
        invitedById: 'u1',
        status: 'accepted',
        role: 'editor',
        createdAt: new Date(),
        acceptedAt: new Date(),
        profile: { name: 'Comercio' },
        user: { email: 'u2@test.com', name: 'User 2' },
      });

      await service.acceptInvitation('c1', 'u2');

      expect(cache.del.mock.calls).toEqual([
        ['me:profiles:u2'],
        ['me:profiles:u1'],
      ]);
    });

    it('rejectInvitation invalida lista del invitado', async () => {
      prisma.profileCollaborator.findFirst.mockResolvedValueOnce({
        id: 'c1',
        profileId: 'p1',
        userId: 'u2',
        invitedById: 'u1',
        status: 'pending',
      });

      await service.rejectInvitation('c1', 'u2');

      expect(cache.del.mock.calls).toEqual([['me:profiles:u2']]);
    });

    it('revoke aceptado invalida listas del dueño y colaborador', async () => {
      ownership.assertOwnedComercioProfile.mockResolvedValue({
        id: 'p1',
      });
      prisma.profileCollaborator.findUnique.mockResolvedValueOnce({
        id: 'c1',
        profileId: 'p1',
        userId: 'u2',
        invitedById: 'u1',
        status: 'accepted',
      });
      prisma.profileCollaborator.update.mockResolvedValueOnce({});

      await service.revoke('p1', 'u1', 'u2');

      expect(cache.del.mock.calls).toEqual([
        ['me:profiles:u1'],
        ['me:profiles:u2'],
      ]);
    });

    it('revoke pendiente elimina y invalida listas del dueño y colaborador', async () => {
      ownership.assertOwnedComercioProfile.mockResolvedValue({
        id: 'p1',
      });
      prisma.profileCollaborator.findUnique.mockResolvedValueOnce({
        id: 'c1',
        profileId: 'p1',
        userId: 'u2',
        invitedById: 'u1',
        status: 'pending',
      });

      await service.revoke('p1', 'u1', 'u2');

      expect(prisma.profileCollaborator.delete).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });
      expect(cache.del.mock.calls).toEqual([
        ['me:profiles:u1'],
        ['me:profiles:u2'],
      ]);
    });
  });

  describe('invite validaciones', () => {
    it('debe lanzar NotFoundException si el invitado no existe', async () => {
      ownership.assertOwnedComercioProfile.mockResolvedValue({
        id: 'p1',
      });
      prisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.invite('p1', 'u1', {
          email: 'missing@test.com',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('debe lanzar ConflictException si ya es colaborador aceptado', async () => {
      ownership.assertOwnedComercioProfile.mockResolvedValue({
        id: 'p1',
      });
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'u2',
        email: 'u2@test.com',
      });
      prisma.profileCollaborator.findUnique.mockResolvedValueOnce({
        status: 'accepted',
      });

      await expect(
        service.invite('p1', 'u1', {
          email: 'u2@test.com',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
