'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { adminApi } from '../adminApi';
import { useAdminLang } from '../AdminI18n';
import { useAdminToast } from '../components';
import { MessageCircle, Send, RefreshCw, Bot, UserCheck, Clock, ArrowLeft } from 'lucide-react';

const POLL_MS = 10000;
const card = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm';

const TABS = [
  { value: '', en: 'All', ar: 'الكل' },
  { value: 'needs_human', en: 'Needs you', ar: 'تحتاج ردك' },
  { value: 'human', en: 'You are replying', ar: 'أنت ترد' },
  { value: 'bot', en: 'Bot handling', ar: 'يرد البوت' },
];

const STATUS_BADGE = {
  bot: { en: 'Bot', ar: 'البوت', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300', icon: Bot },
  needs_human: { en: 'Needs you', ar: 'تحتاج ردك', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300', icon: Clock },
  human: { en: 'You', ar: 'أنت', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300', icon: UserCheck },
};

function StatusBadge({ status, L }) {
  const info = STATUS_BADGE[status] || STATUS_BADGE.bot;
  const Icon = info.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold ${info.cls}`}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {L(info.en, info.ar)}
    </span>
  );
}

function timeAgo(date, L) {
  if (!date) return '';
  const diffMs = Date.now() - new Date(date).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return L('just now', 'الآن');
  if (m < 60) return L(`${m}m ago`, `قبل ${m} د`);
  const h = Math.floor(m / 60);
  if (h < 24) return L(`${h}h ago`, `قبل ${h} س`);
  const d = Math.floor(h / 24);
  return L(`${d}d ago`, `قبل ${d} يوم`);
}

function ConversationRow({ conv, active, onClick, L }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-start px-4 py-3 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${active ? 'bg-blue-50 dark:bg-blue-500/10' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate" dir="ltr">
          {conv.customerName || conv.phone}
        </p>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">{timeAgo(conv.lastMessageAt, L)}</span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5" dir="auto">{conv.lastMessagePreview || '—'}</p>
      <div className="mt-1.5"><StatusBadge status={conv.status} L={L} /></div>
    </button>
  );
}

function MessageBubble({ msg, L }) {
  const mine = msg.direction === 'out';
  const byAdmin = msg.sentBy === 'admin';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
        mine
          ? byAdmin
            ? 'bg-emerald-600 text-white rounded-br-sm'
            : 'bg-blue-600 text-white rounded-br-sm'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-sm'
      }`} dir="auto">
        {msg.messageType === 'template' && (
          <p className="text-[11px] opacity-75 mb-0.5">{L('Automated template message', 'رسالة قالب تلقائية')}</p>
        )}
        <p>{msg.body}</p>
        <p className={`text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`} dir="ltr">
          {new Date(msg.createdAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export default function AdminWhatsAppPage() {
  const { L, isAr } = useAdminLang();
  const toast = useAdminToast();

  const [tab, setTab] = useState('');
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const threadEndRef = useRef(null);
  const seqRef = useRef(0);

  const fetchConversations = useCallback(async (status) => {
    const seq = ++seqRef.current;
    try {
      const res = await adminApi.getWhatsAppConversations(status ? { status } : {});
      if (seq !== seqRef.current) return;
      setConversations(Array.isArray(res?.conversations) ? res.conversations : []);
      setLoadError('');
    } catch (err) {
      if (seq !== seqRef.current) return;
      setLoadError(err?.message || 'Could not load conversations');
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchConversations(tab);
    const id = setInterval(() => fetchConversations(tab), POLL_MS);
    return () => clearInterval(id);
  }, [tab, fetchConversations]);

  const fetchMessages = useCallback(async (phone, { silent } = {}) => {
    if (!silent) setMessagesLoading(true);
    try {
      const res = await adminApi.getWhatsAppMessages(phone);
      setMessages(Array.isArray(res?.messages) ? res.messages : []);
    } catch (err) {
      if (!silent) toast?.error(err?.message || 'Could not load messages');
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!selectedPhone) return undefined;
    fetchMessages(selectedPhone);
    const id = setInterval(() => fetchMessages(selectedPhone, { silent: true }), POLL_MS);
    return () => clearInterval(id);
  }, [selectedPhone, fetchMessages]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const selectedConv = conversations.find((c) => c.phone === selectedPhone);

  const handleSend = async () => {
    const text = reply.trim();
    if (!text || !selectedPhone || sending) return;
    setSending(true);
    try {
      await adminApi.sendWhatsAppReply(selectedPhone, text);
      setReply('');
      await fetchMessages(selectedPhone, { silent: true });
      await fetchConversations(tab);
    } catch (err) {
      toast?.error(err?.message || L('Failed to send message', 'فشل إرسال الرسالة'));
    } finally {
      setSending(false);
    }
  };

  const handleRelease = async () => {
    if (!selectedPhone || releasing) return;
    setReleasing(true);
    try {
      await adminApi.releaseWhatsAppConversation(selectedPhone);
      await fetchConversations(tab);
      toast?.success(L('Handed back to the bot', 'تم إرجاعها للبوت'));
    } catch (err) {
      toast?.error(err?.message || L('Failed', 'فشلت العملية'));
    } finally {
      setReleasing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-blue-600" aria-hidden="true" />
          {L('WhatsApp Inbox', 'صندوق واتساب')}
        </h1>
        <button
          type="button"
          onClick={() => { fetchConversations(tab); if (selectedPhone) fetchMessages(selectedPhone); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          {L('Refresh', 'تحديث')}
        </button>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="flex h-[70vh] min-h-[480px]">
          {/* Conversation list */}
          <div className={`w-full sm:w-80 shrink-0 border-e border-slate-200 dark:border-slate-800 flex flex-col ${selectedPhone ? 'hidden sm:flex' : 'flex'}`}>
            <div className="flex gap-1 p-2 border-b border-slate-100 dark:border-slate-800 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTab(t.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                    tab === t.value
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {L(t.en, t.ar)}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="p-4 text-sm text-slate-500 dark:text-slate-400">{L('Loading…', 'جارٍ التحميل…')}</p>
              ) : loadError ? (
                <p className="p-4 text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
              ) : conversations.length === 0 ? (
                <p className="p-4 text-sm text-slate-500 dark:text-slate-400">{L('No conversations yet.', 'لا توجد محادثات بعد.')}</p>
              ) : (
                conversations.map((conv) => (
                  <ConversationRow
                    key={conv.phone}
                    conv={conv}
                    active={conv.phone === selectedPhone}
                    onClick={() => setSelectedPhone(conv.phone)}
                    L={L}
                  />
                ))
              )}
            </div>
          </div>

          {/* Thread */}
          <div className={`flex-1 flex flex-col min-w-0 ${selectedPhone ? 'flex' : 'hidden sm:flex'}`}>
            {!selectedPhone ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 p-6 text-center">
                {L('Select a conversation to view messages.', 'اختر محادثة لعرض الرسائل.')}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedPhone(null)}
                      className="sm:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                      aria-label={L('Back', 'رجوع')}
                    >
                      <ArrowLeft className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {selectedConv?.customerName || selectedPhone}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate" dir="ltr">{selectedPhone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedConv && <StatusBadge status={selectedConv.status} L={L} />}
                    {selectedConv?.status !== 'bot' && (
                      <button
                        type="button"
                        onClick={handleRelease}
                        disabled={releasing}
                        className="text-xs font-semibold text-blue-700 dark:text-blue-300 hover:underline disabled:opacity-50"
                      >
                        {L('Return to bot', 'إرجاع للبوت')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-50/50 dark:bg-slate-950/30">
                  {messagesLoading ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">{L('Loading…', 'جارٍ التحميل…')}</p>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">{L('No messages yet.', 'لا توجد رسائل بعد.')}</p>
                  ) : (
                    messages.map((msg) => <MessageBubble key={msg._id} msg={msg} L={L} />)
                  )}
                  <div ref={threadEndRef} />
                </div>

                <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    rows={1}
                    placeholder={L('Type a reply…', 'اكتب رداً…')}
                    dir="auto"
                    className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 max-h-32"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!reply.trim() || sending}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700"
                    aria-label={L('Send', 'إرسال')}
                  >
                    <Send className={`w-4 h-4 ${isAr ? '-scale-x-100' : ''}`} aria-hidden="true" />
                  </button>
                </div>
                <p className="px-3 pb-3 text-[11px] text-slate-500 dark:text-slate-400">
                  {L(
                    'Replies only deliver within 24h of the customer\'s last message — Meta blocks free-form messages outside that window.',
                    'الردود تُرسل فقط خلال 24 ساعة من آخر رسالة من العميل — ميتا تمنع الرسائل الحرة خارج هذه المدة.'
                  )}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
