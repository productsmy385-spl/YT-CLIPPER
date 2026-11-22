'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  HelpCircle,
  Plus,
  Search,
  ExternalLink,
  FileText,
  UserCheck,
  RefreshCw,
  Copy,
  Check,
  Filter,
  Youtube,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function RightsManagementPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'creators' | 'pending' | 'licenses' | 'attributions' | 'audit'>('creators');

  // Verify YouTube URL state
  const [checkUrl, setCheckUrl] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<any>(null);
  const [copiedAttribution, setCopiedAttribution] = useState(false);

  // Modal state
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formName, setFormName] = useState('');
  const [formChannelId, setFormChannelId] = useState('');
  const [formChannelUrl, setFormChannelUrl] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formStatus, setFormStatus] = useState('VERIFIED');
  const [formAllowedUsage, setFormAllowedUsage] = useState('all');
  const [formCommercial, setFormCommercial] = useState(true);
  const [formAccessMethod, setFormAccessMethod] = useState('authorized_upload');
  const [formNotes, setFormNotes] = useState('');

  const fetchRightsData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rights');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load rights data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRightsData();
  }, []);

  const handleCheckRights = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkUrl.trim()) return;

    setIsChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch('/api/rights/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: checkUrl.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setCheckResult(json.result);
      } else {
        alert(json.error || 'Failed to verify source rights.');
      }
    } catch (err: any) {
      alert(err.message || 'Rights lookup error.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleRegisterCreator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/rights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_creator',
          name: formName.trim(),
          channelId: formChannelId.trim() || undefined,
          channelUrl: formChannelUrl.trim() || undefined,
          contactEmail: formEmail.trim() || undefined,
          status: 'verified',
          grantPermission: true,
          permissionStatus: formStatus,
          allowedUsage: formAllowedUsage,
          commercialUsageAllowed: formCommercial,
          mediaAccessMethod: formAccessMethod,
          notes: formNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setRegisterModalOpen(false);
        setFormName('');
        setFormChannelId('');
        setFormChannelUrl('');
        setFormEmail('');
        setFormNotes('');
        fetchRightsData();
      } else {
        alert(json.error || 'Failed to register creator');
      }
    } catch (err: any) {
      alert(err.message || 'Registration error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAttribution(true);
    setTimeout(() => setCopiedAttribution(false), 2500);
  };

  const summary = data?.summary || {
    totalCreators: 0,
    verified: 0,
    creativeCommons: 0,
    pending: 0,
    expired: 0,
    rejected: 0,
  };

  const creators = data?.creators || [];
  const permissions = data?.permissions || [];
  const recentChecks = data?.recentChecks || [];
  const attributions = data?.attributions || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Content Rights &amp; Creator Authorizations
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verified permissions registry, YouTube license detection, Creative Commons attribution, and legal compliance.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setRegisterModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#ff8882] to-[#ffc2b4] px-4 py-2 text-xs font-bold text-[#194350] shadow-sm hover:opacity-95 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" /> Register Creator
          </button>
        </div>
      </div>

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="vice-card p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Verified Creators</span>
            <UserCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-foreground">{summary.verified}</div>
          <p className="text-[11px] text-muted-foreground font-medium">Documented permission on file</p>
        </div>

        <div className="vice-card p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Creative Commons</span>
            <CheckCircle2 className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-black text-foreground">{summary.creativeCommons}</div>
          <p className="text-[11px] text-muted-foreground font-medium">CC BY attribution tracked</p>
        </div>

        <div className="vice-card p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Pending Approvals</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-foreground">{summary.pending}</div>
          <p className="text-[11px] text-muted-foreground font-medium">Blocked until reviewed</p>
        </div>

        <div className="vice-card p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold">
            <span>Rights Audits</span>
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-black text-foreground">{recentChecks.length}</div>
          <p className="text-[11px] text-muted-foreground font-medium">Total source video checks</p>
        </div>
      </div>

      {/* Live YouTube Rights Checker Tool */}
      <div className="vice-card p-5 space-y-4 border border-border bg-card">
        <div className="flex items-center gap-2">
          <Youtube className="w-4 h-4 text-red-500" />
          <h2 className="text-sm font-bold text-foreground">Pre-Ingestion Rights &amp; License Verifier</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Paste any public YouTube URL to inspect its licensing status, check creator permissions in our registry, and determine automated acquisition eligibility.
        </p>

        <form onSubmit={handleCheckRights} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={checkUrl}
              onChange={(e) => setCheckUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
            />
          </div>
          <button
            type="submit"
            disabled={isChecking || !checkUrl.trim()}
            className="px-4 py-2 rounded-xl bg-primary text-[#194350] font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-1.5"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isChecking && 'animate-spin')} />
            {isChecking ? 'Inspecting...' : 'Verify Rights'}
          </button>
        </form>

        {checkResult && (
          <div
            className={cn(
              'p-4 rounded-xl border text-xs space-y-2.5 animate-fade-in',
              checkResult.isAllowed
                ? 'border-emerald-500/30 bg-emerald-500/5 text-foreground'
                : 'border-amber-500/30 bg-amber-500/5 text-foreground'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {checkResult.status === 'VERIFIED' ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    VERIFIED CREATOR PERMISSION
                  </span>
                ) : checkResult.status === 'CREATIVE_COMMONS' ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/20 text-primary border border-primary/30">
                    CREATIVE COMMONS (CC BY)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                    {checkResult.status} (RESTRICTED)
                  </span>
                )}
                <span className="font-semibold text-muted-foreground font-mono">ID: {checkResult.videoId}</span>
              </div>

              <span className="text-[10px] font-bold uppercase">
                {checkResult.isAllowed ? '✓ Processing Permitted' : '✗ Upload Required'}
              </span>
            </div>

            <p className="text-muted-foreground">{checkResult.reason}</p>

            {checkResult.attributionRequired && checkResult.attributionText && (
              <div className="mt-2 p-2.5 rounded-lg bg-background border border-border space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-foreground">
                  <span>Mandatory CC BY Attribution:</span>
                  <button
                    onClick={() => copyToClipboard(checkResult.attributionText)}
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    {copiedAttribution ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    {copiedAttribution ? 'Copied' : 'Copy Text'}
                  </button>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground select-all leading-relaxed">
                  {checkResult.attributionText}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-border pb-2 overflow-x-auto text-xs font-semibold">
        <button
          onClick={() => setActiveTab('creators')}
          className={cn(
            'px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5',
            activeTab === 'creators'
              ? 'bg-primary text-[#194350] font-bold shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          <UserCheck className="w-3.5 h-3.5" /> Authorized Creators ({creators.length})
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          className={cn(
            'px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5',
            activeTab === 'pending'
              ? 'bg-primary text-[#194350] font-bold shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          <Clock className="w-3.5 h-3.5" /> Pending Permissions ({summary.pending})
        </button>

        <button
          onClick={() => setActiveTab('attributions')}
          className={cn(
            'px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5',
            activeTab === 'attributions'
              ? 'bg-primary text-[#194350] font-bold shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          <FileText className="w-3.5 h-3.5" /> Attribution Statements ({attributions.length})
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={cn(
            'px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5',
            activeTab === 'audit'
              ? 'bg-primary text-[#194350] font-bold shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          <ShieldCheck className="w-3.5 h-3.5" /> Verification History ({recentChecks.length})
        </button>
      </div>

      {/* TAB 1: Authorized Creators */}
      {activeTab === 'creators' && (
        <div className="vice-card overflow-hidden border border-border bg-card">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-foreground">Registered Content Creators</h3>
              <p className="text-xs text-muted-foreground">Creators who have granted written permission or partner licenses.</p>
            </div>
            <button
              onClick={() => setRegisterModalOpen(true)}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Creator
            </button>
          </div>

          {creators.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <UserCheck className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-xs font-semibold text-foreground">No Registered Creators Yet</p>
              <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                Register creators with signed agreements or authorization documents to enable automatic video acquisition.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border text-[11px] font-bold text-muted-foreground uppercase">
                  <tr>
                    <th className="p-3">Creator</th>
                    <th className="p-3">Channel ID</th>
                    <th className="p-3">Permission Status</th>
                    <th className="p-3">Allowed Usage</th>
                    <th className="p-3">Media Source Method</th>
                    <th className="p-3">Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {creators.map((c: any) => {
                    const perm = permissions.find((p: any) => p.creator_id === c.id);
                    return (
                      <tr key={c.id} className="hover:bg-muted/20">
                        <td className="p-3 font-bold text-foreground flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-xs">
                            {c.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div>{c.name}</div>
                            {c.notes && <div className="text-[10px] text-muted-foreground font-normal">{c.notes}</div>}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-muted-foreground">
                          {c.channel_id || 'Not specified'}
                        </td>
                        <td className="p-3">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                              perm?.status === 'VERIFIED'
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : perm?.status === 'PENDING'
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                            )}
                          >
                            {perm?.status || c.status}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {perm?.allowed_usage || 'all'}
                          {perm?.commercial_usage_allowed ? ' (Commercial Allowed)' : ''}
                        </td>
                        <td className="p-3 font-mono text-[11px] text-primary">
                          {perm?.media_access_method || 'authorized_upload'}
                        </td>
                        <td className="p-3 text-muted-foreground">{c.contact_email || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Pending Permissions */}
      {activeTab === 'pending' && (
        <div className="vice-card p-5 space-y-3 border border-border bg-card">
          <h3 className="font-bold text-sm text-foreground">Pending Permission Requests</h3>
          <p className="text-xs text-muted-foreground">
            These sources have been identified but require administrative approval of supporting agreements before automated acquisition.
          </p>

          {permissions.filter((p: any) => p.status === 'PENDING').length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center italic">No pending permissions at this time.</p>
          ) : (
            <div className="space-y-2">
              {permissions
                .filter((p: any) => p.status === 'PENDING')
                .map((p: any) => (
                  <div key={p.id} className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 flex items-center justify-between text-xs">
                    <div>
                      <strong className="text-foreground">{p.creator_name || p.creator_id}</strong>
                      <p className="text-[11px] text-muted-foreground">Channel: {p.channel_id || 'Pending link'}</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 uppercase">
                      Needs Review
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Attributions */}
      {activeTab === 'attributions' && (
        <div className="vice-card p-5 space-y-4 border border-border bg-card">
          <h3 className="font-bold text-sm text-foreground">Creative Commons Attribution Statements</h3>
          <p className="text-xs text-muted-foreground">
            Official attribution notices automatically attached to derivative vertical Shorts published from CC BY sources.
          </p>

          {attributions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center italic">No attribution records generated yet.</p>
          ) : (
            <div className="space-y-3">
              {attributions.map((att: any) => (
                <div key={att.id} className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-foreground">
                    <span>{att.title}</span>
                    <button
                      onClick={() => copyToClipboard(att.attribution_text)}
                      className="text-[11px] text-primary hover:underline flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> Copy Attribution
                    </button>
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground select-all bg-background p-2.5 rounded-lg border border-border leading-relaxed">
                    {att.attribution_text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Verification History */}
      {activeTab === 'audit' && (
        <div className="vice-card p-5 space-y-3 border border-border bg-card">
          <h3 className="font-bold text-sm text-foreground">Rights Verification Audit Trail</h3>
          <p className="text-xs text-muted-foreground">Immutable history of source rights checks executed by the multi-agent system.</p>

          {recentChecks.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center italic">No rights checks recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {recentChecks.map((chk: any) => (
                <div key={chk.id} className="p-3 rounded-xl border border-border bg-muted/20 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">Video: {chk.video_id}</span>
                      <span
                        className={cn(
                          'text-[10px] font-bold px-1.5 py-0.5 rounded uppercase',
                          chk.is_allowed
                            ? 'bg-emerald-500/20 text-emerald-600'
                            : 'bg-amber-500/20 text-amber-600'
                        )}
                      >
                        {chk.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{chk.reason}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground select-none">
                    {new Date(chk.checked_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Register Creator Modal */}
      {registerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-scale-in text-foreground">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-primary" /> Register Authorized Creator
              </h3>
              <button
                onClick={() => setRegisterModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRegisterCreator} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Creator / Channel Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. BruceDropEmOff, Rockstar Games, Gaming Archive"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs focus:ring-1 focus:ring-primary font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground mb-1">YouTube Channel ID</label>
                  <input
                    type="text"
                    value={formChannelId}
                    onChange={(e) => setFormChannelId(e.target.value)}
                    placeholder="UC..."
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="creator@management.com"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground mb-1">Permission Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs font-bold"
                  >
                    <option value="VERIFIED">VERIFIED (Active)</option>
                    <option value="PENDING">PENDING (Review)</option>
                    <option value="REJECTED">REJECTED</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground mb-1">Media Access Method</label>
                  <select
                    value={formAccessMethod}
                    onChange={(e) => setFormAccessMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs font-bold"
                  >
                    <option value="authorized_upload">Creator Master Upload</option>
                    <option value="licensed_feed">Licensed Media Feed</option>
                    <option value="partner_api">Partner API Integration</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={formCommercial}
                  onChange={(e) => setFormCommercial(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <span className="font-semibold text-muted-foreground">Commercial usage &amp; monetization permitted</span>
              </label>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Agreement Details / Supporting Evidence
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Signed licensing agreement dated 2026-11-20 granting derivative shorts rights."
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setRegisterModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-primary text-[#194350] font-bold text-xs hover:opacity-95 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Creator Permission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
