# AI Chat Application Design Guidelines

## Design Approach
**Reference-Based**: Drawing from Linear's clean aesthetics, ChatGPT's conversational patterns, and Slack's organized messaging hierarchy. Focus on functional elegance with purposeful minimalism.

## Core Design Principles
- **Conversational Clarity**: Messages as primary focus with distinct sender differentiation
- **Spatial Hierarchy**: Clear zones for navigation, conversation, and input
- **Adaptive Foundation**: Seamless light/dark mode transitions built into core structure

---

## Typography System

**Primary Font**: Inter (Google Fonts)
**Secondary Font**: JetBrains Mono (for code blocks/technical content)

**Scale**:
- Display/Headers: text-2xl font-semibold
- Message Content: text-base font-normal
- Metadata (timestamps, labels): text-sm font-medium
- Input Placeholder: text-base font-normal
- Buttons/Actions: text-sm font-medium

---

## Layout Architecture

**Spacing Units**: Tailwind units of 2, 4, 6, 8, 12, 16 (e.g., p-4, gap-6, mb-8)

**Three-Zone Layout**:
1. **Sidebar** (280px fixed): Conversation history, new chat button, settings
2. **Main Chat** (flex-1): Message thread with infinite scroll
3. **Input Zone** (fixed bottom): Persistent text input with actions

**Responsive Behavior**:
- Desktop: Full three-zone
- Tablet/Mobile: Collapsible sidebar (hamburger menu), full-width chat

---

## Component Library

### Navigation Sidebar
- Top: Logo + "New Chat" button (prominent, w-full, mb-6)
- Middle: Scrollable conversation list (grouped by date: "Today", "Yesterday", "Last 7 Days")
- Bottom: User profile, settings icon, theme toggle
- Each conversation item: Title preview, timestamp, hover state with delete/rename icons

### Message Bubbles
**User Messages**:
- Right-aligned, max-width of 75%
- Rounded corners (rounded-2xl)
- Include avatar (top-right, 32px circle)
- Timestamp below message (text-xs, subtle)

**AI Messages**:
- Left-aligned, max-width of 75%
- AI agent avatar (top-left, 32px with distinct indicator)
- Include action row below: Copy, Regenerate, Share icons (16px)
- Support rich content: code blocks, lists, tables

**Message Spacing**: mb-6 between messages, grouped by sender with reduced spacing (mb-2)

### Input Area
**Container**: Fixed bottom with backdrop blur, border-top, p-4
**Text Input**: 
- Multi-line textarea with auto-expand (max 200px height)
- Rounded-xl border
- Placeholder: "Message AI Agent..."
- Character counter (bottom-right, subtle)

**Action Row** (below input):
- Left: Attach file, Voice input icons
- Right: Send button (primary, rounded-full, icon-only when empty, expands to "Send" text when content exists)

### Supporting Components
- **Code Blocks**: JetBrains Mono, syntax highlighting, copy button (top-right)
- **Loading States**: Typing indicator (three animated dots), skeleton messages
- **Empty State**: Centered welcome message with suggested prompts (4 cards in 2x2 grid)
- **Toast Notifications**: Top-right corner for actions (copied, error messages)

---

## Visual Enhancements

**Animations**: Subtle only
- Message appear: Fade-in with slight slide-up (200ms)
- Typing indicator: Pulsing dots
- Hover states: Scale 1.02 or brightness shift (100ms)

**Shadows & Depth**:
- Sidebar: Subtle border-right or shadow-sm
- Message bubbles: shadow-sm on hover
- Input area: shadow-md for elevation
- Floating buttons: shadow-lg

**Dividers**: 
- Use sparingly between message groups (thin, 1px, subtle)
- Conversation list items: border-bottom (very subtle)

---

## Dark/Light Mode Strategy

Build with CSS variables or Tailwind's dark: prefix from the start. Ensure:
- Sufficient contrast for readability (WCAG AA minimum)
- Inverted but consistent hierarchy
- Smooth transitions between modes (transition-colors duration-200)

---

## Images Section

**No Hero Image Required**: This is a chat application interface, not a landing page. 

**Avatar System**:
- User avatars: 32px circles throughout (profile photos or initials)
- AI agent avatar: Distinctive icon/logo (32px, consistent branding)
- Empty state illustration: Simple, abstract graphic representing AI conversation (max 200px, centered)

**Optional Enhancement**: Subtle background pattern or gradient in empty state areas (very low opacity, non-distracting)

---

## Accessibility & Polish

- Focus indicators: 2px outline with offset for all interactive elements
- Skip navigation link for keyboard users
- ARIA labels for icon-only buttons
- Message thread auto-scrolls to latest
- Keyboard shortcuts: Cmd/Ctrl+K for new chat, Enter to send, Shift+Enter for new line