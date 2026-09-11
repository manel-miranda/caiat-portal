# Roadmap

## A) Customer database
- [ ] Migration: guests search indexes, customer RPCs (upsert/update profile), create_stay_with_guest p_guest_id
- [ ] Customers list page with search
- [ ] Customer detail page (history + metrics + internal notes)
- [ ] New Stay customer picker + returning context
- [ ] Stay detail new/returning badge
- [ ] Translations EN/PT/FR/AR

## B) Users, roles, permissions, PIN
- [ ] Enum migration: app_role 'supervisor' (own transaction)
- [ ] user_permissions table + has_permission + role defaults
- [ ] Admin RPCs: set_user_role / set_user_permission / set_user_active
- [ ] Update existing RPCs + RLS to permission checks
- [ ] Server functions: resetUserPin, changeMyPin, createUser, setUserActive (ban)
- [ ] Users & Permissions admin page + Change my PIN
- [ ] Set Ahmed to supervisor
- [ ] Translations EN/PT/FR/AR

## QA
- [ ] Backend permission/last-admin/duplicate-guest tests
- [ ] PIN reset round trip with temp QA user, then cleanup
- [ ] Typecheck + production build
- [ ] Report commit SHA + READY TO PUBLISH
