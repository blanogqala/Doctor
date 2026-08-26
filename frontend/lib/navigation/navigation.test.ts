import { describe, expect, it } from 'vitest';
import {
  doctorNavItems,
  doctorNavigation,
  isNavItemActive,
  patientNavigation,
  platformAdminNavigation,
  receptionNavigation,
} from './index';

describe('role navigation configs', () => {
  it('reception includes core operational routes', () => {
    const hrefs = receptionNavigation.map((n) => n.href);
    expect(hrefs).toContain('/admin');
    expect(hrefs).toContain('/admin/appointments');
    expect(hrefs).toContain('/admin/patients');
    expect(hrefs).toContain('/admin/settings');
  });

  it('doctor includes telemedicine and clinical routes', () => {
    const hrefs = doctorNavigation.map((n) => n.href);
    expect(hrefs).toContain('/doctor');
    expect(hrefs).toContain('/doctor/queue');
    expect(hrefs).toContain('/doctor/records');
    expect(hrefs).toContain('/doctor/telemedicine');
    expect(hrefs).toContain('/doctor/messages');
    expect(hrefs).not.toContain('/doctor/practice-management');
  });

  it('only the practice owner sees Practice Management', () => {
    const ownerHrefs = doctorNavItems(true).map((n) => n.href);
    const doctorHrefs = doctorNavItems(false).map((n) => n.href);
    expect(ownerHrefs).toContain('/doctor/practice-management');
    expect(doctorHrefs).not.toContain('/doctor/practice-management');
    expect(doctorHrefs).toContain('/doctor/profile');
  });

  it('patient includes booking and records', () => {
    const hrefs = patientNavigation.map((n) => n.href);
    expect(hrefs).toContain('/patient/book');
    expect(hrefs).toContain('/patient/records');
    expect(hrefs).toContain('/patient/telemedicine');
  });

  it('platform admin covers practices and billing', () => {
    const hrefs = platformAdminNavigation.map((n) => n.href);
    expect(hrefs).toEqual([
      '/super-admin/dashboard',
      '/super-admin/inquiries',
      '/super-admin/practices',
      '/super-admin/billing',
      '/super-admin/support',
    ]);
  });

  it('isNavItemActive respects role base path', () => {
    expect(isNavItemActive('/doctor', '/doctor', '/doctor')).toBe(true);
    expect(isNavItemActive('/doctor/queue', '/doctor', '/doctor')).toBe(false);
    expect(isNavItemActive('/doctor/queue', '/doctor/queue', '/doctor')).toBe(true);
    expect(isNavItemActive('/doctor/records/abc', '/doctor/records', '/doctor')).toBe(true);
  });
});
