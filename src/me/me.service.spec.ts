import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MeService } from './me.service';
import { PrismaService } from '../prisma/prisma.service';
import { BcvRateService } from '../bcv/bcv-rate.service';
import { ResendEmailService } from '../email/resend-email.service';
import { ProfileCollaboratorService } from '../profile-collaborators/profile-collaborator.service';

const mockPrisma = () => ({
  profile: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  profileCollaborator: {
    findMany: jest.fn(),
  },
  profileMember: {
    findMany: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
});

const mockBcv = () => ({
  getLatestVesPerUsdPreferToday: jest.fn(),
});

const mockResendEmail = () => ({
  sendWelcomeEmail: jest.fn(),
});

const mockProfileCollaborators = () => ({
  listProfilesForUser: jest.fn(),
  invalidateProfileList: jest.fn(),
});

describe('MeService — perfiles e invalidación de caché', () => {
  let service: MeService;
  let prisma: ReturnType<typeof mockPrisma>;
  let collaborators: ReturnType<typeof mockProfileCollaborators>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeService,
        { provide: PrismaService, useValue: mockPrisma() },
        { provide: BcvRateService, useValue: mockBcv() },
        { provide: ResendEmailService, useValue: mockResendEmail() },
        {
          provide: ProfileCollaboratorService,
          useValue: mockProfileCollaborators(),
        },
      ],
    }).compile();

    service = module.get<MeService>(MeService);
    prisma = module.get(PrismaService);
    collaborators = module.get(ProfileCollaboratorService);
    jest.clearAllMocks();
  });

  describe('createProfile', () => {
    it('debe invalidar la caché de perfiles del usuario tras crear', async () => {
      prisma.profile.create.mockResolvedValueOnce({
        id: 'p1',
        name: 'Nuevo',
        type: 'familiar',
      });

      const result = await service.createProfile(
        { userId: 'u1', email: 'u1@test.com' },
        { name: 'Nuevo', type: 'familiar' },
      );

      expect(result).toMatchObject({ id: 'p1', access: 'owner' });
      expect(collaborators.invalidateProfileList).toHaveBeenCalledWith('u1');
    });
  });

  describe('deleteProfile', () => {
    it('debe invalidar caché del dueño y colaboradores al eliminar perfil', async () => {
      prisma.profile.findFirst.mockResolvedValueOnce({
        id: 'p1',
        userId: 'u1',
      });
      prisma.profileCollaborator.findMany.mockResolvedValueOnce([
        { userId: 'u2' },
        { userId: 'u3' },
      ]);

      await service.deleteProfile({ userId: 'u1', email: 'u1@test.com' }, 'p1');

      expect(prisma.profile.delete).toHaveBeenCalledWith({
        where: { id: 'p1' },
      });
      expect(collaborators.invalidateProfileList).toHaveBeenCalledWith('u1');
      expect(collaborators.invalidateProfileList).toHaveBeenCalledWith('u2');
      expect(collaborators.invalidateProfileList).toHaveBeenCalledWith('u3');
    });

    it('debe lanzar NotFoundException si el perfil no existe', async () => {
      prisma.profile.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.deleteProfile({ userId: 'u1', email: 'u1@test.com' }, 'p1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(collaborators.invalidateProfileList).not.toHaveBeenCalled();
    });
  });
});
