import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import UserMaster from '../UserMaster';
import api from '../../../services/axiosInstance';
import useStore from '../../../store';

// Mock dependencies
vi.mock('../../../services/axiosInstance', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../../../store', () => ({
  __esModule: true,
  default: vi.fn()
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn()
}));
vi.mock('../../../components/common', () => ({
  DataTable: ({ data, actions }) => (
    <div data-testid="user-table">
      {data.map((user, idx) => (
        <div key={user.id || idx} data-testid="user-row">
          <span>{user.username}</span>
          {actions && actions.map((action, actionIdx) => {
             const isDelete = action.className?.includes('red');
             return (
               <button 
                 key={actionIdx} 
                 onClick={() => action.onClick(user)}
                 aria-label={isDelete ? "delete-btn" : "action-btn"}
               >
                 {isDelete ? "Delete" : "Edit"}
               </button>
             );
          })}
        </div>
      ))}
    </div>
  ),
  Modal: ({ children, isOpen }) => isOpen ? <div>{children}</div> : null,
  DeleteConfirmDialog: ({ isOpen, onConfirm }) => isOpen ? (
    <div data-testid="delete-dialog">
      <button onClick={onConfirm} aria-label="confirm-delete">Confirm Delete</button>
    </div>
  ) : null
}));
vi.mock('react-icons/fa', () => ({
  FaPlus: () => null,
  FaEdit: () => null,
  FaTrash: () => null,
  FaSignOutAlt: () => null,
  FaSync: () => null // Added missing mock
}));

describe('UserMaster Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.mockReturnValue({
      users: [],
      setUsers: vi.fn(),
      showToast: vi.fn()
    });
    // Mock localStorage
    Storage.prototype.getItem = vi.fn((key) => {
      if (key === 'userRole') return 'admin';
      return null;
    });
  });

  test('fetches all pages of users correctly', async () => {
    // Mock API to return 2 pages of data
    api.get.mockImplementation((url, config) => {
      if (url === '/admin/users') {
        const page = config?.params?.page || 1;
        if (page === 1) {
          return Promise.resolve({
            data: {
              data: {
                data: [{ _id: '1', name: 'User 1', email: 'u1@test.com' }],
                meta: { hasNextPage: true }
              }
            }
          });
        } else if (page === 2) {
          return Promise.resolve({
            data: {
              data: {
                data: [{ _id: '2', name: 'User 2', email: 'u2@test.com' }],
                meta: { hasNextPage: false }
              }
            }
          });
        }
      }
      return Promise.resolve({ data: { data: { data: [] } } });
    });

    const setUsersMock = vi.fn();
    useStore.mockReturnValue({
      users: [],
      setUsers: setUsersMock,
      showToast: vi.fn()
    });

    render(<UserMaster />);

    // Wait for effect to run and fetch loop to complete
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2); // Should call twice for pagination
      expect(setUsersMock).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ username: 'User 1' }),
        expect.objectContaining({ username: 'User 2' })
      ]));
    });
  });

  test('handles user deletion correctly', async () => {
    // Setup store with one user
    const mockUser = { id: 'user-12345', username: 'Test User' }; // ID length > 5 for safety check
    const setUsersMock = vi.fn();
    
    useStore.mockReturnValue({
      users: [mockUser],
      setUsers: setUsersMock,
      showToast: vi.fn()
    });

    // Mock delete API success
    api.delete.mockResolvedValue({ data: { success: true } });
    
    // We also need to mock getUsers for the refresh call after delete
    api.get.mockResolvedValue({ data: { data: { data: [] } } }); // Return empty after delete

    render(<UserMaster />);

    // Check if user row is rendered
    expect(screen.getByText('Test User')).toBeTruthy();

    // Click Delete button
    const deleteBtns = screen.getAllByLabelText('delete-btn');
    expect(deleteBtns.length).toBeGreaterThan(0);
    fireEvent.click(deleteBtns[0]);

    // Check if dialog opens - Wait for state update
    expect(await screen.findByTestId('delete-dialog')).toBeTruthy();

    // Confirm Delete
    const confirmBtn = screen.getByLabelText('confirm-delete');
    fireEvent.click(confirmBtn);

    // Verify API call
    await waitFor(() => {
       expect(api.delete).toHaveBeenCalledWith('/admin/users/user-12345');
    });
    
    // Verify refresh called (getUsers)
    await waitFor(() => {
       expect(api.get).toHaveBeenCalled(); 
    });
  });
});
