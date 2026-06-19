# The KbCart ERP Frontend

A production-grade ERP frontend built with React, TypeScript, and Tailwind CSS for automotive business management.

## Tech Stack

- **React 19** - UI Framework
- **TypeScript** - Type Safety
- **Tailwind CSS** - Styling
- **React Router** - Navigation
- **Zustand** - State Management
- **Axios** - HTTP Client
- **React Hook Form** - Form Management
- **Vite** - Build Tool

## Features

### Authentication & Context

- ✅ Login Screen with validation
- ✅ Firm Selection/Dashboard Selector
- ✅ Global state management with Zustand

### Masters

- ✅ Firm Setup (Create/Edit with GST configuration)
- ✅ Party/Account Master
- ✅ Item Master (Excel-like grid interface)
- 🚧 Group Master
- 🚧 Unit Master
- 🚧 HSN/GST Master
- 🚧 Agent Master
- 🚧 Transport Master
- 🚧 Book Master
- 🚧 Print Setup

### Transactions

- ✅ Challan Entry (with stock validation)
- 🚧 Challan List/Drafts
- 🚧 Create Bill from Challans
- 🚧 Sale Entry (Manual Bill)
- 🚧 Purchase Entry
- 🚧 Sale/Purchase Returns
- 🚧 Cash/Bank Receive/Payment
- 🚧 Journal Entry
- 🚧 Opening Entry

### Inventory & Stock

- 🚧 Stock List
- 🚧 Item Ledger
- 🚧 Reorder Report
- 🚧 Dead Stock Report

### Reports & Ledgers

- 🚧 GST Report
- 🚧 Sale/Purchase Reports
- 🚧 Party Ledger
- 🚧 Trial Balance
- 🚧 Graph Reports

### Utilities

- 🚧 Fast Edit
- 🚧 User Rights
- 🚧 Backup/Restore
- 🚧 Financial Year Close

## Project Structure

```
src/
├── components/           # Reusable components
│   ├── ui/              # UI components (FormComponents, etc.)
│   ├── masterComp/      # Master-related components
│   ├── transtation/     # Transaction components
│   ├── ChallanEntry.jsx # Challan creation
│   ├── FirmSetup.jsx    # Firm management
│   ├── ItemMaster.jsx   # Excel-like item grid
│   ├── Layout.jsx       # Main layout
│   ├── Sidebar.jsx      # Navigation sidebar
│   └── GlobalComponents.jsx # Toast, Modal, etc.
├── pages/               # Page components
├── services/            # API services
├── store/               # Zustand store
├── utils/               # Utility functions
└── App.jsx             # Main app component
```

## Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd The-KbCart/frontend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your API URL
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

## Key Components

### 1. Authentication Flow

- Login → Company Selection → Dashboard
- JWT token management
- Automatic token refresh

### 2. State Management (Zustand)

```javascript
// Global state structure
{
  user: null,
  selectedFirm: null,
  firms: [],
  loading: false,
  toast: null,
  confirmDialog: null,
  // ... data caches
}
```

### 3. Form Components

Reusable form components with validation:

- `FormField` - Field wrapper with label and error
- `Input` - Styled input with error states
- `Select` - Dropdown with options
- `Button` - Various button variants
- `Card` - Content container
- `Table` - Data table with sorting
- `Modal` - Overlay dialogs

### 4. API Integration

Centralized API service with:

- Automatic token injection
- Error handling
- Request/response interceptors

### 5. Excel-like Item Master

- Inline editing
- Keyboard navigation (Tab, Enter)
- Auto-save on blur
- Stock validation
- Bulk operations

## Business Rules Implementation

### GST Validation

- NON-GST purchase cannot be sold via GST firm
- GST purchase CAN be sold via NON-GST firm
- GSTIN format validation

### Stock Management

- Single physical stock ledger across firms
- Real-time stock validation
- Reserved stock tracking

### Challan → Bill Flow

- Mandatory challan creation before billing
- Multiple challans can be merged into one bill
- Item-level GST/NON-GST selection

### Returns & Credits

- Returned value becomes client credit
- Automatic credit application to next bill
- Stock reversal on returns

## Development Guidelines

### Code Style

- Use TypeScript for type safety
- Follow React hooks patterns
- Implement proper error boundaries
- Use semantic HTML elements

### Component Design

- Keep components focused and reusable
- Use composition over inheritance
- Implement proper prop validation
- Handle loading and error states

### State Management

- Use Zustand for global state
- Keep local state minimal
- Implement optimistic updates
- Cache frequently used data

### API Integration

- Handle network errors gracefully
- Implement retry logic
- Use proper HTTP status codes
- Validate responses

## Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e
```

## Build & Deployment

```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:prod
```

## Environment Variables

```bash
VITE_API_URL=http://localhost:3000/api
VITE_APP_NAME=The KbCart ERP
VITE_VERSION=1.0.0
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

This project is proprietary software. All rights reserved.

## Support

For support and questions:

- Email: support@thekbcart.com
- Documentation: [Internal Wiki]
- Issue Tracker: [Internal System]

---

**Status**: 🚧 In Development
**Version**: 1.0.0-alpha
**Last Updated**: January 2025

// this line is needed for deployment
