# 🎨 Theme System - Developer Guide

**Phase 1 Milestone:** Theme System Implementation Complete ✅

---

## 📚 How to Use the New Theme System

### 1. Importing Theme Components

Choose one of these imports based on what you need:

```dart
/// Option 1: Import specific theme component
import 'package:maheshwari_motors_app/app/core/theme/app_colors.dart';
import 'package:maheshwari_motors_app/app/core/theme/app_text_styles.dart';
import 'package:maheshwari_motors_app/app/core/constants/app_spacing.dart';

/// Option 2: Import everything from theme index (recommended)
import 'package:maheshwari_motors_app/app/core/theme/app_theme_index.dart';

/// Option 3: Import constants index
import 'package:maheshwari_motors_app/app/core/constants/app_constants_index.dart';
```

---

## 🎨 COLOR USAGE

### Available Colors (DO NOT HARDCODE!)

```dart
// ✅ DO THIS
Container(
  color: AppColors.primary,
  child: Text('Click me', style: AppTextStyles.buttonLarge),
)

// ❌ DON'T DO THIS
Container(
  color: Color(0xFF0066CC),  // HARDCODED!
  child: Text('Click me', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),  // HARDCODED!
)
```

### Color Categories

#### Primary Colors

```dart
AppColors.primary              // #0066CC - Main buttons, links, highlights
AppColors.primaryLight         // #E0EEFA - Light background for primary elements
AppColors.primaryDark          // #1E3A8A - Darker primary variant
```

#### Semantic Colors

```dart
AppColors.success              // #16A34A - Success states (green)
AppColors.error                // #DC2626 - Error states (red)
AppColors.warning              // #F59E0B - Warning states (orange)
AppColors.info                 // #3B82F6 - Info states (blue)
```

#### Text Colors

```dart
AppColors.textPrimary          // #1F2937 - Main text
AppColors.textSecondary        // #6B7280 - Secondary text (hints, metadata)
AppColors.textTertiary         // #9CA3AF - Tertiary text
AppColors.textDisabled         // #D1D5DB - Disabled text
```

#### Component Colors

```dart
AppColors.border               // #E5E7EB - Default borders
AppColors.inputBg              // #F9FAFB - Input backgrounds
AppColors.disabled             // #D1D5DB - Disabled states
```

#### Gray Scale (Use as needed)

```dart
AppColors.white                // #FFFFFF
AppColors.gray50               // #F9FAFB - Lightest gray
AppColors.gray100              // #F3F4F6
AppColors.gray200              // #E5E7EB
// ... all the way to gray900 (#111827)
```

#### Status Badges

```dart
// Sale/Green badge
AppColors.badgeGreen           // #16A34A
AppColors.badgeGreenLight      // #F0FDF4

// Purchase/Blue badge
AppColors.badgeBlue            // #0066CC
AppColors.badgeBlueLight       // #E0EEFA

// Neutral badge
AppColors.badgeGray            // #9CA3AF
AppColors.badgeGrayLight       // #F3F4F6
```

---

## 📝 TYPOGRAPHY USAGE

### Available Text Styles (DO NOT HARDCODE!)

```dart
// ✅ DO THIS
Text('Title', style: AppTextStyles.h1)
Text('Body', style: AppTextStyles.body)

// ❌ DON'T DO THIS
Text('Title', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700))
```

### Text Style Categories

#### Headings

```dart
AppTextStyles.h1               // 28px Bold - Page titles
AppTextStyles.h2               // 24px Semibold - Section headers
AppTextStyles.h3               // 20px Semibold - Subsection headers
```

#### Body Text

```dart
AppTextStyles.body             // 16px Regular - Main content
AppTextStyles.bodySmall        // 14px Regular - Secondary content
AppTextStyles.caption          // 12px Regular - Hints, metadata
AppTextStyles.captionTiny      // 10px Regular - Minimal text
```

#### Labels

```dart
AppTextStyles.label            // 14px Medium - Form labels
AppTextStyles.labelSmall       // 12px Medium - Compact labels
```

#### Buttons

```dart
AppTextStyles.buttonLarge      // 16px Semibold - Primary buttons
AppTextStyles.buttonMedium     // 14px Semibold - Secondary buttons
AppTextStyles.buttonSmall      // 12px Semibold - Small buttons
```

#### Special Styles

```dart
AppTextStyles.error            // 12px Regular - Error messages (red)
AppTextStyles.success          // 12px Regular - Success messages (green)
AppTextStyles.warning          // 12px Regular - Warning messages (orange)
AppTextStyles.badge            // 11px Medium - Badge text
AppTextStyles.number           // 14px Medium - Prices, quantities
AppTextStyles.numberLarge      // 18px Semibold - Large amounts
AppTextStyles.tableHeader      // 12px Semibold - Table headers
AppTextStyles.tableCell        // 13px Regular - Table content
```

### Customizing Text Styles

```dart
// ✅ DO THIS - Customize existing style
Text(
  'Custom Title',
  style: AppTextStyles.h1.copyWith(
    color: AppColors.primary,  // Override color
    fontStyle: FontStyle.italic, // Add italic
  ),
)

// ❌ DON'T DO THIS
Text(
  'Custom Title',
  style: TextStyle(
    fontSize: 28,
    fontWeight: FontWeight.w700,
    color: Color(0xFF0066CC),
  ),
)
```

---

## 📏 SPACING USAGE

### Available Spacing Constants (DO NOT HARDCODE!)

```dart
// ✅ DO THIS
SizedBox(height: AppSpacing.md)
Padding(padding: EdgeInsets.all(AppSpacing.lg))

// ❌ DON'T DO THIS
SizedBox(height: 12)
Padding(padding: EdgeInsets.all(16))
```

### Spacing Scale

```dart
AppSpacing.xs              // 4px - Minimal spacing
AppSpacing.sm              // 8px - Small spacing
AppSpacing.md              // 12px - Medium spacing (default)
AppSpacing.lg              // 16px - Large spacing
AppSpacing.xl              // 20px - Extra large
AppSpacing.xxl             // 24px - 2x large
AppSpacing.xxxl            // 32px - 3x large
AppSpacing.huge            // 40px - Huge
AppSpacing.massive         // 48px - Massive
```

### Pre-built Gaps

```dart
// Vertical gaps
AppSpacing.gapXs           // SizedBox(height: 4)
AppSpacing.gapSm           // SizedBox(height: 8)
AppSpacing.gapMd           // SizedBox(height: 12)
// ... and so on

// Horizontal gaps
AppSpacing.hGapXs          // SizedBox(width: 4)
AppSpacing.hGapSm          // SizedBox(width: 8)
// ... and so on
```

### Pre-built Padding

```dart
AppSpacing.paddingAll       // EdgeInsets.all(16)
AppSpacing.paddingAllSm     // EdgeInsets.all(8)
AppSpacing.paddingAllMd     // EdgeInsets.all(12)
AppSpacing.paddingAllXl     // EdgeInsets.all(20)
AppSpacing.paddingAllXxl    // EdgeInsets.all(24)

AppSpacing.paddingHorizontal // EdgeInsets.symmetric(horizontal: 16)
AppSpacing.paddingVertical   // EdgeInsets.symmetric(vertical: 16)
```

### Border Radius

```dart
AppSpacing.borderRadiusSm   // BorderRadius.circular(6)
AppSpacing.borderRadiusMd   // BorderRadius.circular(10)
AppSpacing.borderRadiusLg   // BorderRadius.circular(12)
AppSpacing.borderRadiusXl   // BorderRadius.circular(14)
AppSpacing.borderRadiusXxl  // BorderRadius.circular(16)
```

---

## 🏗️ COMMON PATTERNS

### Pattern 1: Simple Container with Text

```dart
Container(
  padding: AppSpacing.paddingAll,
  decoration: BoxDecoration(
    color: AppColors.primary,
    borderRadius: AppSpacing.borderRadiusMd,
  ),
  child: Text(
    'Click Me',
    style: AppTextStyles.buttonLarge,
  ),
)
```

### Pattern 2: Form Field

```dart
TextField(
  style: AppTextStyles.input,
  decoration: InputDecoration(
    labelText: 'Item Name',
    labelStyle: AppTextStyles.label,
    hintText: 'Enter item name',
    hintStyle: AppTextStyles.hint,
    contentPadding: AppSpacing.paddingAll,
  ),
)
```

### Pattern 3: List Item

```dart
Container(
  padding: AppSpacing.paddingAll,
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text('Item Title', style: AppTextStyles.bodySmall),
      AppSpacing.gapSm,
      Text('Item description', style: AppTextStyles.caption),
    ],
  ),
)
```

### Pattern 4: Status Badge

```dart
Container(
  padding: EdgeInsets.symmetric(
    horizontal: AppSpacing.md,
    vertical: AppSpacing.sm,
  ),
  decoration: BoxDecoration(
    color: AppColors.badgeGreenLight,
    borderRadius: AppSpacing.borderRadiusMd,
  ),
  child: Text('Active', style: AppTextStyles.badge.copyWith(
    color: AppColors.badgeGreen,
  )),
)
```

### Pattern 5: Error Message

```dart
Text(
  'This field is required',
  style: AppTextStyles.error,
)
```

---

## 🎯 BEST PRACTICES

### ✅ DO:

1. **Always use theme constants** - Never hardcode colors or font sizes
2. **Use copyWith() for customization** - Extend existing styles rather than creating new ones
3. **Follow the hierarchy** - Use H1 for main titles, H2 for sections, H3 for subsections
4. **Use semantic colors** - Green for success, red for errors, orange for warnings
5. **Keep spacing consistent** - Use AppSpacing values throughout
6. **Group related constants** - Import what you need at the top

### ❌ DON'T:

1. **Hardcode colors** - Never use Color(0xFF...)
2. **Hardcode font sizes** - Never use fontSize: 16
3. **Hardcode spacing** - Never use SizedBox(height: 12)
4. **Mix themes** - When using light theme, don't add dark theme code
5. **Create custom text styles inline** - Always use AppTextStyles
6. **Override theme values unnecessarily** - Use existing styles when possible

---

## 📱 RESPONSIVE DESIGN

While theme values are fixed, make layouts responsive by wrapping containers:

```dart
// ✅ DO THIS - Use theme for base, MediaQuery for responsive
Widget build(BuildContext context) {
  final isMobile = MediaQuery.of(context).size.width < 600;

  return Padding(
    padding: isMobile
      ? AppSpacing.paddingAll
      : AppSpacing.paddingAllXxl,
    child: Text('Hello', style: AppTextStyles.h1),
  );
}
```

---

## 🔄 UPDATING THE THEME

If colors need to change in the future:

1. **Update one place** - Edit `AppColors` class only
2. **All widgets automatically update** - No need to touch individual widgets
3. **Version the changes** - Add comments with dates

Example:

```dart
/// Updated March 2026 - Changed primary color to match new brand
static const Color primary = Color(0xFF0066CC);
```

---

## 📧 Common Questions

### Q: Can I create custom colors?

**A:** No. If you need a new color, add it to `AppColors` first, then use it everywhere.

### Q: Can I use System colors?

**A:** No. Always use `AppColors`. System colors are not mobile-optimized.

### Q: What if I need a slightly different shade?

**A:** Use `copyWith()` on existing styles, or add a new variant to `AppColors` with a descriptive name.

### Q: How do I apply theme to entire pages?

**A:** The theme is automatically applied via `main.dart`. Just build widgets using the constants.

### Q: Can I have dark mode?

**A:** Currently only light theme. Dark mode can be added by creating `AppTheme.dark` property.

---

## ✨ Phase 1 Completion Checklist

- [x] Colors system extracted from Tailwind
- [x] Typography system created
- [x] Spacing system updated
- [x] AppTheme updated with new colors
- [x] Export indexes created
- [x] Developer guide written
- [ ] Build test screen to verify theme
- [ ] Document any issues found

---

**Next Steps:**

1. Review this guide
2. Verify colors match Figma designs
3. Update any UI components to use theme
4. Test on multiple device sizes

**Support:**
If you find any issues or need additions to the theme system, update the relevant files and regenerate this guide.

---

**Theme System Status:** ✅ **READY FOR USE**
