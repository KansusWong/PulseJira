import { scopedSelect, scopedInsert, scopedUpdate, scopedDelete, validateOrgId } from '../scoped-query';

const mockEq = jest.fn().mockReturnThis();
const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
const mockInsert = jest.fn().mockReturnValue({ select: jest.fn().mockReturnThis() });
const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
const mockDelete = jest.fn().mockReturnValue({ eq: mockEq });
const mockFrom = jest.fn().mockReturnValue({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
});

const mockSupabase = { from: mockFrom } as any;

describe('scoped-query', () => {
  beforeEach(() => jest.clearAllMocks());

  it('scopedSelect appends org_id filter after select()', () => {
    scopedSelect(mockSupabase, 'projects', 'org-123', '*');
    expect(mockFrom).toHaveBeenCalledWith('projects');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).toHaveBeenCalledWith('org_id', 'org-123');
  });

  it('validateOrgId throws on empty string', () => {
    expect(() => validateOrgId('')).toThrow();
  });
});
