'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { EmptyState } from '@/components/shared/empty-state';
import { messagesApi } from '@/lib/api/misc';
import { patientsApi } from '@/lib/api/patients';
import { initials, formatTime, formatDate } from '@/lib/format';
import { patientDisplayName } from '@/lib/patients/display-name';
import type { Message, Patient, Profile } from '@/lib/types';
import { MessageSquare, Send, Search, ArrowLeft, Headset, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { notifyMessagesUnreadChanged } from '@/lib/messages-events';
import { usePollingRefresh } from '@/lib/use-polling-refresh';

interface Conversation {
  patient: Patient;
  otherProfile: Profile;
  messages: Message[];
  unreadCount: number;
}

const POLL_MS = 5_000;

export function MessagesView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingAdmin, setStartingAdmin] = useState(false);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messageText, setMessageText] = useState('');
  const [search, setSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeConversation) {
      activeKeyRef.current = `${activeConversation.patient.id}-${activeConversation.otherProfile.id}`;
    }
  }, [activeConversation]);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);

    try {
      const allMessages = await messagesApi.list();
      const convMap = new Map<string, Conversation>();

      for (const msg of allMessages as (Message & {
        sender: Profile;
        recipient: Profile;
        patient?: Patient;
      })[]) {
        // SYSTEM notices are audience=recipient only (confirmation vs admin alert)
        if (msg.type === 'SYSTEM' && msg.recipient_id !== user.id) {
          continue;
        }

        const otherProfile = msg.sender_id === user.id ? msg.recipient : msg.sender;
        const key = `${msg.patient_id}-${otherProfile.id}`;

        if (!convMap.has(key)) {
          const patient = msg.patient ?? (await patientsApi.getById(msg.patient_id));
          convMap.set(key, {
            patient,
            otherProfile,
            messages: [],
            unreadCount: 0,
          });
        }

        const conv = convMap.get(key)!;
        conv.messages.push(msg);
        if (msg.recipient_id === user.id && !msg.read_at) {
          conv.unreadCount++;
        }
      }

      const convList = Array.from(convMap.values()).sort((a, b) => {
        const aLast = a.messages[a.messages.length - 1]?.created_at ?? '';
        const bLast = b.messages[b.messages.length - 1]?.created_at ?? '';
        return bLast.localeCompare(aLast);
      });

      setConversations(convList);

      const key = activeKeyRef.current;
      if (key) {
        const updated = convList.find(
          (c) => `${c.patient.id}-${c.otherProfile.id}` === key
        );
        if (updated) setActiveConversation(updated);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const silentRefresh = useCallback(() => load(true), [load]);
  usePollingRefresh(silentRefresh, POLL_MS, !!user);

  useEffect(() => {
    if (!activeConversation || !user) return;
    const unread = activeConversation.messages.filter(
      (m) => m.recipient_id === user.id && !m.read_at
    );
    if (unread.length === 0) return;

    // Clear conversation badge + sidebar count immediately, then sync with server
    setActiveConversation((prev) =>
      prev ? { ...prev, unreadCount: 0, messages: prev.messages.map((m) =>
        m.recipient_id === user.id && !m.read_at
          ? { ...m, read_at: new Date().toISOString() }
          : m
      ) } : prev
    );
    setConversations((prev) =>
      prev.map((c) =>
        c.patient.id === activeConversation.patient.id &&
        c.otherProfile.id === activeConversation.otherProfile.id
          ? {
              ...c,
              unreadCount: 0,
              messages: c.messages.map((m) =>
                m.recipient_id === user.id && !m.read_at
                  ? { ...m, read_at: new Date().toISOString() }
                  : m
              ),
            }
          : c
      )
    );
    notifyMessagesUnreadChanged({ readDelta: unread.length });

    (async () => {
      for (const msg of unread) {
        await messagesApi.markRead(msg.id);
      }
      await load(true);
      notifyMessagesUnreadChanged();
    })();
  }, [activeConversation, user, load]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

  const handleSend = async () => {
    if (!messageText.trim() || !activeConversation || !user) return;
    await messagesApi.create({
      recipient_id: activeConversation.otherProfile.id,
      patient_id: activeConversation.patient.id,
      body: messageText.trim(),
    });
    setMessageText('');
    await load(true);
  };

  const handleContactAdmin = async () => {
    if (!user || user.role !== 'PATIENT') return;
    setStartingAdmin(true);
    try {
      const result = await messagesApi.startAdminChat();
      await load(true);
      setActiveConversation((prev) => {
        const found = conversations.find(
          (c) =>
            c.patient.id === result.patient_id &&
            c.otherProfile.id === result.admin_id
        );
        return found ?? prev;
      });
      // Reload then select — load updates conversations; select after next tick via key
      activeKeyRef.current = `${result.patient_id}-${result.admin_id}`;
      const allMessages = await messagesApi.list();
      const convMap = new Map<string, Conversation>();
      for (const msg of allMessages as (Message & {
        sender: Profile;
        recipient: Profile;
        patient?: Patient;
      })[]) {
        const otherProfile = msg.sender_id === user.id ? msg.recipient : msg.sender;
        const key = `${msg.patient_id}-${otherProfile.id}`;
        if (!convMap.has(key)) {
          const patient = msg.patient ?? (await patientsApi.getById(msg.patient_id));
          convMap.set(key, { patient, otherProfile, messages: [], unreadCount: 0 });
        }
        const conv = convMap.get(key)!;
        conv.messages.push(msg);
        if (msg.recipient_id === user.id && !msg.read_at) conv.unreadCount++;
      }
      const convList = Array.from(convMap.values()).sort((a, b) => {
        const aLast = a.messages[a.messages.length - 1]?.created_at ?? '';
        const bLast = b.messages[b.messages.length - 1]?.created_at ?? '';
        return bLast.localeCompare(aLast);
      });
      setConversations(convList);
      const opened = convList.find(
        (c) => c.patient.id === result.patient_id && c.otherProfile.id === result.admin_id
      );
      if (opened) setActiveConversation(opened);
    } catch (err) {
      toast({
        title: 'Could not start chat',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setStartingAdmin(false);
    }
  };

  const filteredConversations = conversations.filter(
    (c) =>
      !search ||
      c.otherProfile.full_name.toLowerCase().includes(search.toLowerCase()) ||
      patientDisplayName(c.patient).toLowerCase().includes(search.toLowerCase())
  );

  const isPatient = user?.role === 'PATIENT';

  return (
    <div className="relative space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Messages</h1>
        <p className="text-sm text-muted-foreground">Secure communication</p>
      </div>

      <Card className="h-[calc(100vh-220px)] min-h-[400px]">
        <CardContent className="h-full p-0">
          <div className="flex h-full">
            <div
              className={`flex flex-col border-r-2 border-primary/30 ${
                activeConversation ? 'hidden md:flex' : 'flex'
              } w-full md:w-72 lg:w-80`}
            >
              <div className="border-b-2 border-primary/30 p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                {loading ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">Loading...</p>
                ) : filteredConversations.length === 0 ? (
                  <EmptyState
                    icon={<MessageSquare className="h-8 w-8" />}
                    title="No conversations"
                    description={
                      isPatient
                        ? 'Messages and booking notices will appear here. Contact reception to get started.'
                        : 'Messages will appear here.'
                    }
                    action={
                      isPatient ? (
                        <Button onClick={handleContactAdmin} disabled={startingAdmin}>
                          <Headset className="mr-2 h-4 w-4" />
                          {startingAdmin ? 'Opening...' : 'Contact Admin'}
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  filteredConversations.map((conv) => {
                    const lastMsg = conv.messages[conv.messages.length - 1];
                    const isActive =
                      activeConversation?.patient.id === conv.patient.id &&
                      activeConversation?.otherProfile.id === conv.otherProfile.id;
                    return (
                      <button
                        key={`${conv.patient.id}-${conv.otherProfile.id}`}
                        onClick={() => setActiveConversation(conv)}
                        className={`flex w-full items-center gap-3 border-b border-primary/20 p-3 text-left transition-colors hover:bg-muted/50 ${
                          isActive ? 'bg-muted' : ''
                        }`}
                      >
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {initials(conv.otherProfile.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="truncate font-medium text-sm text-foreground">
                              {conv.otherProfile.full_name}
                            </p>
                            {lastMsg && (
                              <span className="text-xs text-muted-foreground">
                                {formatTime(lastMsg.created_at)}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {lastMsg?.type === 'SYSTEM' ? `Notice: ${lastMsg.body}` : lastMsg?.body ?? 'No messages'}
                          </p>
                        </div>
                        {conv.unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                            {conv.unreadCount}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {activeConversation ? (
              <div className="flex flex-1 flex-col">
                <div className="flex items-center gap-3 border-b p-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    onClick={() => setActiveConversation(null)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {initials(activeConversation.otherProfile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-foreground">
                      {activeConversation.otherProfile.full_name}
                    </p>
                    {user?.role !== 'PATIENT' && (
                      <p className="text-xs text-muted-foreground">
                        Patient: {patientDisplayName(activeConversation.patient)}
                      </p>
                    )}
                    {user?.role === 'PATIENT' && activeConversation.otherProfile.role === 'ADMIN' && (
                      <p className="text-xs text-muted-foreground">Clinic reception</p>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto scrollbar-thin p-4">
                  {activeConversation.messages.map((msg) => {
                    if (msg.type === 'SYSTEM') {
                      return (
                        <div key={msg.id} className="flex justify-center">
                          <div className="max-w-[90%] rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-center">
                            <div className="mb-1 flex items-center justify-center gap-1.5 text-primary">
                              <Info className="h-3.5 w-3.5" />
                              <span className="text-xs font-medium">Notification</span>
                            </div>
                            <p className="text-sm text-foreground">{msg.body}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatDate(msg.created_at)} {formatTime(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    const isMe = msg.sender_id === user?.id;
                    return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[75%] rounded-lg px-3 py-2 ${
                            isMe
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-foreground'
                          }`}
                        >
                          <p className="text-sm">{msg.body}</p>
                          <p
                            className={`mt-1 text-xs ${
                              isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'
                            }`}
                          >
                            {formatDate(msg.created_at)} {formatTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t p-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === 'Enter' &&
                        !e.shiftKey &&
                        (e.preventDefault(), handleSend())
                      }
                    />
                    <Button onClick={handleSend} disabled={!messageText.trim()} size="icon">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="hidden flex-1 items-center justify-center md:flex">
                <EmptyState
                  icon={<MessageSquare className="h-10 w-10" />}
                  title="Select a conversation"
                  description="Choose a conversation from the list to view messages."
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isPatient && (
        <Button
          onClick={handleContactAdmin}
          disabled={startingAdmin}
          className="fixed bottom-6 right-6 z-40 h-14 gap-2 rounded-full px-5 shadow-lg md:bottom-8 md:right-8"
          size="lg"
        >
          <Headset className="h-5 w-5" />
          {startingAdmin ? 'Opening...' : 'Contact Admin'}
        </Button>
      )}
    </div>
  );
}
