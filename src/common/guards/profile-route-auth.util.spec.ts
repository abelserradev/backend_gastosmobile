import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { resolveProfileRouteAuth } from './profile-route-auth.util';

function mockContext(
  params: Record<string, string | string[] | undefined>,
  user?: { userId: string },
): ExecutionContext {
  const request = { params, user };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('resolveProfileRouteAuth', () => {
  it('lanza si no hay usuario autenticado', () => {
    expect(() =>
      resolveProfileRouteAuth(mockContext({ profileId: 'p1' })),
    ).toThrow(ForbiddenException);
  });

  it('normaliza profileId cuando viene como array', () => {
    const result = resolveProfileRouteAuth(
      mockContext({ profileId: ['prof-abc', 'ignored'] }, { userId: 'u1' }),
    );
    expect(result).toEqual({ userId: 'u1', profileId: 'prof-abc' });
  });

  it('devuelve profileId undefined si la ruta no lo incluye', () => {
    const result = resolveProfileRouteAuth(
      mockContext({}, { userId: 'u1' }),
    );
    expect(result.profileId).toBeUndefined();
  });
});
