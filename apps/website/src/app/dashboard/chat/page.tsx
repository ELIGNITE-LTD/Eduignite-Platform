"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Crown,
  Loader2,
  Lock,
  MessageCircle,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Smile,
  Users,
  UserPlus,
  UserX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { chatService } from "@/lib/api/services/chat.service";
import { resolveMediaUrl } from "@/lib/media";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RelatedChatUser, TeacherGroupClassOption } from "@/lib/api/types";

const normalizeList = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const parseDRFError = (err: any): string => {
  if (!err?.response) return err?.message || "Network error. Please check your connection.";
  const status = err.response.status;
  const data = err.response.data;
  if (!data) return `HTTP ${status}`;
  if (typeof data === "string") return `${status}: ${data}`;
  if (data.detail) return `${status}: ${data.detail}`;
  if (typeof data === "object") {
    return `${status}: ${Object.entries(data)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
      .join(" | ")}`;
  }
  return `HTTP ${status}`;
};

const getParticipantId = (participant: any) => participant.user_id ?? participant.id;
const getParticipantName = (participant: any) => participant.user_name ?? participant.name;
const getParticipantAvatar = (participant: any) => resolveMediaUrl(participant.user_avatar ?? participant.avatar);

const getMessageSenderId = (message: any) => message.sender_id ?? message.sender?.id;
const getMessageSenderName = (message: any) => message.sender_name ?? message.sender?.name;
const getMessageSenderAvatar = (message: any) =>
  resolveMediaUrl(message.sender_avatar ?? message.sender?.avatar);

const getConversationDisplay = (conversation: any, currentUserId: any) => {
  if (conversation.conversation_type === "direct") {
    const other =
      (conversation.participants || []).find(
        (participant: any) => String(getParticipantId(participant)) !== String(currentUserId)
      ) ?? conversation.participants?.[0];
    return {
      name: other ? getParticipantName(other) : conversation.name || "Unknown",
      avatar: other ? getParticipantAvatar(other) : "",
    };
  }

  return {
    name: conversation.name || "Group Chat",
    avatar: "",
  };
};

const isGroupAdmin = (conversation: any, currentUserId: string | undefined) =>
  Array.isArray(conversation?.admin_participant_ids) &&
  conversation.admin_participant_ids.map(String).includes(String(currentUserId));

export default function ChatPage() {
  const { user } = useAuth();
  const { t, translateText } = useI18n();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [messageText, setMessageText] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const typingIdleRef = useRef<any>(null);
  const lastTypingPingRef = useRef<number>(0);
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoadingConvs, setIsLoadingConvs] = useState(true);
  const [isLoadingMsgs, setIsLoadingMsgs] = useState(false);
  const [convsErrorMsg, setConvsErrorMsg] = useState<string | null>(null);
  const [msgsErrorMsg, setMsgsErrorMsg] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const [composerMode, setComposerMode] = useState<"direct" | "group">("direct");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [availableUsers, setAvailableUsers] = useState<RelatedChatUser[]>([]);
  const [teacherGroupOptions, setTeacherGroupOptions] = useState<TeacherGroupClassOption[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingGroupOptions, setIsLoadingGroupOptions] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState<string | null>(null);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [isUpdatingGroup, setIsUpdatingGroup] = useState(false);
  const [newParticipantId, setNewParticipantId] = useState("");

  const [groupForm, setGroupForm] = useState({
    name: "",
    schoolClass: "",
    subject: "",
    onlyAdminsCanSend: false,
    participantIds: [] as string[],
  });

  const isExecutive = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER"].includes(user?.role || "");

  const canCreateTeacherGroups = user?.role === "TEACHER";

  const scrollToBottom = () => {
    window.setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 80);
  };

  const loadConversations = useCallback(async () => {
    setIsLoadingConvs(true);
    setConvsErrorMsg(null);
    try {
      const result = await chatService.getConversations();
      setConversations(normalizeList(result));
    } catch (err: any) {
      setConvsErrorMsg(parseDRFError(err));
      console.error("[Chat] Failed to load conversations:", err?.response ?? err);
    } finally {
      setIsLoadingConvs(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string, quiet = false) => {
    if (!quiet) setIsLoadingMsgs(true);
    setMsgsErrorMsg(null);
    try {
      const result = await chatService.getMessages(conversationId);
      const loaded = normalizeList(result).reverse();
      setMessages((prev) => {
        const loadedIds = new Set(loaded.map((message: any) => String(message.id)));
        const pending = prev.filter((message: any) => message._pending && !loadedIds.has(String(message.id)));
        return [...loaded, ...pending];
      });
      setLastSyncedAt(new Date());
      scrollToBottom();
    } catch (err: any) {
      if (!quiet) setMsgsErrorMsg(parseDRFError(err));
      console.error("[Chat] Failed to load messages:", err?.response ?? err);
    } finally {
      if (!quiet) setIsLoadingMsgs(false);
    }
  }, []);

  const loadComposerData = useCallback(async () => {
    setIsLoadingUsers(true);
    setIsLoadingGroupOptions(canCreateTeacherGroups);
    try {
      const [relatedUsers, groupOptions] = await Promise.all([
        chatService.getRelatedUsers(),
        canCreateTeacherGroups ? chatService.getTeacherGroupOptions() : Promise.resolve([]),
      ]);
      setAvailableUsers(
        normalizeList(relatedUsers).filter((record: any) => String(record.id) !== String(user?.id))
      );
      setTeacherGroupOptions(normalizeList(groupOptions));
    } catch (err) {
      setAvailableUsers([]);
      setTeacherGroupOptions([]);
    } finally {
      setIsLoadingUsers(false);
      setIsLoadingGroupOptions(false);
    }
  }, [canCreateTeacherGroups, user?.id]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedConv) {
      setMessages([]);
      setLastSyncedAt(null);
      return;
    }
    loadMessages(String(selectedConv.id));
  }, [selectedConv, loadMessages]);

  useEffect(() => {
    if (!selectedConv) return;
    const convId = String(selectedConv.id);
    const pollTyping = () => {
      chatService
        .getTyping(convId)
        .then((res) => setTypingUsers((res.typing || []).map((t) => t.user_name).filter(Boolean)))
        .catch(() => {});
    };
    pollTyping();
    const interval = window.setInterval(() => {
      loadMessages(convId, true);
      loadConversations();
      pollTyping();
    }, 5000);
    // Typing is polled more frequently so the indicator feels live.
    const typingInterval = window.setInterval(pollTyping, 2500);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(typingInterval);
    };
  }, [selectedConv?.id, loadMessages, loadConversations]);

  // Clear the typing list when switching conversations.
  useEffect(() => {
    setTypingUsers([]);
    setReactionPickerFor(null);
  }, [selectedConv?.id]);

  const pingTyping = useCallback(() => {
    if (!selectedConv) return;
    const convId = String(selectedConv.id);
    const now = Date.now();
    // Throttle "typing" pings to at most one every 3s.
    if (now - lastTypingPingRef.current > 3000) {
      lastTypingPingRef.current = now;
      chatService.setTyping(convId, true).catch(() => {});
    }
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    typingIdleRef.current = setTimeout(() => {
      chatService.setTyping(convId, false).catch(() => {});
      lastTypingPingRef.current = 0;
    }, 3500);
  }, [selectedConv]);

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    setReactionPickerFor(null);
    try {
      const updated = await chatService.reactToMessage(messageId, emoji);
      setMessages((prev) => prev.map((m) => (String(m.id) === String(messageId) ? { ...m, reactions: (updated as any).reactions } : m)));
    } catch (err: any) {
      toast({ variant: "destructive", title: "Reaction failed", description: parseDRFError(err) });
    }
  }, [toast]);

  const handleSend = useCallback(async () => {
    if (!messageText.trim() || !selectedConv) return;

    const text = messageText.trim();
    const tempId = `tmp_${Date.now()}`;
    setMessageText("");

    const optimisticMessage = {
      id: tempId,
      sender_id: user?.id,
      sender_name: user?.name,
      sender_avatar: user?.avatar,
      text,
      created_at: new Date().toISOString(),
      is_official: isExecutive,
      _pending: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    scrollToBottom();
    setIsSending(true);
    // Stop broadcasting "typing" as soon as the message goes out.
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    lastTypingPingRef.current = 0;
    chatService.setTyping(String(selectedConv.id), false).catch(() => {});

    try {
      const sent = await chatService.sendMessage(String(selectedConv.id), {
        text,
        conversation_id: String(selectedConv.id),
      } as any);
      setMessages((prev) => prev.map((message) => (message.id === tempId ? sent : message)));
      setLastSyncedAt(new Date());
      loadConversations();
    } catch (err: any) {
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      setMessageText(text);
      toast({ variant: "destructive", title: "Send failed", description: parseDRFError(err) });
      console.error("[Chat] Send message error:", err?.response ?? err);
    } finally {
      setIsSending(false);
    }
  }, [messageText, selectedConv, user, isExecutive, toast, loadConversations]);

  const resetComposerState = () => {
    setUserSearch("");
    setComposerMode("direct");
    setGroupForm({
      name: "",
      schoolClass: "",
      subject: "",
      onlyAdminsCanSend: false,
      participantIds: [],
    });
  };

  const handleOpenNewChat = () => {
    resetComposerState();
    setNewChatOpen(true);
    loadComposerData();
  };

  const handleStartConversation = async (targetUser: RelatedChatUser) => {
    setIsStartingChat(String(targetUser.id));
    try {
      const conversation = await chatService.getOrCreateDirect(String(targetUser.id));
      await loadConversations();
      setSelectedConv(conversation);
      setNewChatOpen(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Could not start conversation", description: parseDRFError(err) });
    } finally {
      setIsStartingChat(null);
    }
  };

  const handleCreateTeacherGroup = async () => {
    if (!groupForm.schoolClass || !groupForm.subject) {
      toast({ variant: "destructive", title: "Missing information", description: "Select a class and subject first." });
      return;
    }

    setIsSavingGroup(true);
    try {
      const conversation = await chatService.createTeacherGroup({
        name: groupForm.name,
        school_class: groupForm.schoolClass,
        subject: groupForm.subject,
        only_admins_can_send: groupForm.onlyAdminsCanSend,
        participant_ids: groupForm.participantIds,
      });
      await loadConversations();
      setSelectedConv(conversation);
      setNewChatOpen(false);
      toast({ title: "Group created", description: "Students in the selected class were added automatically." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Group creation failed", description: parseDRFError(err) });
    } finally {
      setIsSavingGroup(false);
    }
  };

  const handleToggleAdminOnly = async () => {
    if (!selectedConv) return;
    setIsUpdatingGroup(true);
    try {
      const updated = await chatService.updateConversationSettings(String(selectedConv.id), {
        only_admins_can_send: !selectedConv.only_admins_can_send,
      } as any);
      setSelectedConv(updated);
      await loadConversations();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: parseDRFError(err) });
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const handleRemoveParticipant = async (userId: string) => {
    if (!selectedConv) return;
    setIsUpdatingGroup(true);
    try {
      await chatService.removeParticipant(String(selectedConv.id), userId);
      const updated = await chatService.getConversation(String(selectedConv.id));
      setSelectedConv(updated);
      await loadConversations();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Removal failed", description: parseDRFError(err) });
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const handleAddParticipant = async () => {
    if (!selectedConv || !newParticipantId) return;
    setIsUpdatingGroup(true);
    try {
      await chatService.addParticipant(String(selectedConv.id), newParticipantId);
      const updated = await chatService.getConversation(String(selectedConv.id));
      setSelectedConv(updated);
      setNewParticipantId("");
      await loadConversations();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Add participant failed", description: parseDRFError(err) });
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const handleSetRole = async (userId: string, role: "admin" | "member") => {
    if (!selectedConv) return;
    setIsUpdatingGroup(true);
    try {
      await chatService.setParticipantRole(String(selectedConv.id), userId, role);
      const updated = await chatService.getConversation(String(selectedConv.id));
      setSelectedConv(updated);
      await loadConversations();
      toast({ title: role === "admin" ? "Admin added" : "Admin dismissed", description: role === "admin" ? "This member can now manage the group." : "This member is no longer an admin." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Role update failed", description: parseDRFError(err) });
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const filteredUsers = availableUsers.filter((record: any) => {
    const query = userSearch.toLowerCase();
    return (
      !query ||
      (record.name || "").toLowerCase().includes(query) ||
      (record.email || "").toLowerCase().includes(query) ||
      (record.role || "").toLowerCase().includes(query) ||
      (record.relationship_labels || []).some((label: string) => label.toLowerCase().includes(query))
    );
  });

  const currentConversationDisplay = selectedConv ? getConversationDisplay(selectedConv, user?.id) : null;
  const syncLabel = lastSyncedAt ? translateText("Active sync") : translateText("Sync pending");
  const selectedClassOption = teacherGroupOptions.find((item) => item.id === groupForm.schoolClass);
  const groupCandidateUsers = filteredUsers.filter((record) => record.role !== "STUDENT");
  const participantIds = new Set((selectedConv?.participants || []).map((participant: any) => String(getParticipantId(participant))));
  const addableParticipants = availableUsers.filter((record) => !participantIds.has(String(record.id)));
  const currentUserIsGroupAdmin = selectedConv ? isGroupAdmin(selectedConv, user?.id) : false;

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] gap-4">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline flex items-center gap-3 leading-none">
          {isExecutive ? <Crown className="w-6 h-6 text-secondary" /> : <MessageCircle className="w-6 h-6 text-secondary" />}
          {isExecutive ? "Board Chat" : t("chat")}
        </h1>
        <Button size="sm" onClick={handleOpenNewChat} className="gap-2 rounded-xl bg-primary text-white font-bold shadow-md">
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="max-w-2xl rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-black text-primary uppercase tracking-tight">
              <Users className="w-5 h-5 text-secondary" />
              Start a Conversation
            </DialogTitle>
            <DialogDescription className="text-xs">
              Chat is scoped to the people connected to your school role, classes, and academic relationships.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={composerMode === "direct" ? "default" : "outline"}
              className="rounded-xl"
              onClick={() => setComposerMode("direct")}
            >
              Direct Chat
            </Button>
            {canCreateTeacherGroups && (
              <Button
                type="button"
                variant={composerMode === "group" ? "default" : "outline"}
                className="rounded-xl"
                onClick={() => setComposerMode("group")}
              >
                Teacher Group
              </Button>
            )}
          </div>

          {composerMode === "direct" ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search related users..."
                  className="pl-9 bg-accent/30 border-none rounded-xl text-sm h-10"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                />
              </div>
              <ScrollArea className="h-72">
                {isLoadingUsers && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-primary/30" />
                  </div>
                )}
                {!isLoadingUsers && filteredUsers.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {userSearch ? "No related users match your search." : "No related users are available yet."}
                  </div>
                )}
                <div className="space-y-1 pr-2">
                  {filteredUsers.map((record: any) => (
                    <button
                      key={record.id}
                      onClick={() => handleStartConversation(record)}
                      disabled={isStartingChat === String(record.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent/50 transition-all text-left group"
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={resolveMediaUrl(record.avatar) || ""} />
                        <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                          {(record.name || "?").charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <p className="font-bold text-sm text-primary truncate">{record.name || "Unknown"}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="text-[8px] h-3.5 py-0 font-black uppercase bg-secondary/20 text-primary border-none">
                            {record.role}
                          </Badge>
                          {(record.relationship_labels || []).slice(0, 2).map((label: string) => (
                            <Badge key={label} variant="outline" className="text-[8px] h-3.5 py-0 font-black uppercase">
                              {label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      {isStartingChat === String(record.id) ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary/40 shrink-0" />
                      ) : (
                        <MessageCircle className="w-4 h-4 text-primary/20 group-hover:text-primary/60 transition-colors shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="space-y-4">
              {isLoadingGroupOptions ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary/30" />
                </div>
              ) : teacherGroupOptions.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No class-subject assignments were found for your account yet.
                </div>
              ) : (
                <>
                  <Input
                    value={groupForm.name}
                    onChange={(event) => setGroupForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Optional group name"
                    className="bg-accent/30 border-none rounded-xl text-sm h-10"
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Select
                      value={groupForm.schoolClass}
                      onValueChange={(value) =>
                        setGroupForm((prev) => ({ ...prev, schoolClass: value, subject: "" }))
                      }
                    >
                      <SelectTrigger className="rounded-xl h-10">
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        {teacherGroupOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name} ({option.student_count} students)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={groupForm.subject}
                      onValueChange={(value) => setGroupForm((prev) => ({ ...prev, subject: value }))}
                      disabled={!selectedClassOption}
                    >
                      <SelectTrigger className="rounded-xl h-10">
                        <SelectValue placeholder="Select subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {(selectedClassOption?.subjects || []).map((subject) => (
                          <SelectItem key={subject.id} value={subject.id}>
                            {subject.name} ({subject.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-2xl bg-accent/20 p-4 text-xs text-muted-foreground">
                    Students in the selected class are added automatically. You can also include extra related users below and later update the group settings.
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Extra participants
                    </p>
                    <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                      {groupCandidateUsers.map((record) => {
                        const isSelected = groupForm.participantIds.includes(String(record.id));
                        return (
                          <button
                            key={record.id}
                            type="button"
                            className={cn(
                              "w-full flex items-center justify-between rounded-xl border px-3 py-2 text-left",
                              isSelected ? "border-primary bg-primary/5" : "border-transparent bg-accent/20"
                            )}
                            onClick={() =>
                              setGroupForm((prev) => ({
                                ...prev,
                                participantIds: isSelected
                                  ? prev.participantIds.filter((id) => id !== String(record.id))
                                  : [...prev.participantIds, String(record.id)],
                              }))
                            }
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={resolveMediaUrl(record.avatar) || ""} />
                                <AvatarFallback>{record.name?.charAt(0) || "?"}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-bold text-primary">{record.name}</p>
                                <p className="text-[10px] uppercase text-muted-foreground">{record.role}</p>
                              </div>
                            </div>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-left text-sm",
                      groupForm.onlyAdminsCanSend ? "border-primary bg-primary/5" : "border-accent bg-white"
                    )}
                    onClick={() =>
                      setGroupForm((prev) => ({
                        ...prev,
                        onlyAdminsCanSend: !prev.onlyAdminsCanSend,
                      }))
                    }
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-primary">Only admins can send messages</p>
                        <p className="text-xs text-muted-foreground">Teachers can switch this later in group settings.</p>
                      </div>
                      <Badge className={groupForm.onlyAdminsCanSend ? "bg-primary" : "bg-muted text-foreground"}>
                        {groupForm.onlyAdminsCanSend ? "On" : "Off"}
                      </Badge>
                    </div>
                  </button>
                </>
              )}
            </div>
          )}

          {composerMode === "group" && (
            <DialogFooter>
              <Button
                onClick={handleCreateTeacherGroup}
                disabled={isSavingGroup || !groupForm.schoolClass || !groupForm.subject}
                className="gap-2 rounded-xl"
              >
                {isSavingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                Create Group
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={groupSettingsOpen} onOpenChange={setGroupSettingsOpen}>
        <DialogContent className="max-w-xl rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary font-black uppercase">
              <Settings2 className="w-5 h-5 text-secondary" />
              Group Settings
            </DialogTitle>
            <DialogDescription>Update conversation controls and manage group members.</DialogDescription>
          </DialogHeader>
          {selectedConv && (
            <div className="space-y-4">
              <button
                type="button"
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left text-sm",
                  selectedConv.only_admins_can_send ? "border-primary bg-primary/5" : "border-accent bg-white"
                )}
                onClick={handleToggleAdminOnly}
                disabled={isUpdatingGroup}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Lock className="w-4 h-4 mt-1 text-primary/60" />
                    <div>
                      <p className="font-bold text-primary">Only admins can send messages</p>
                      <p className="text-xs text-muted-foreground">Restrict posting to the group admin team only.</p>
                    </div>
                  </div>
                  {isUpdatingGroup ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Badge className={selectedConv.only_admins_can_send ? "bg-primary" : "bg-muted text-foreground"}>
                      {selectedConv.only_admins_can_send ? "Enabled" : "Disabled"}
                    </Badge>
                  )}
                </div>
              </button>

              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Members</p>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {(selectedConv.participants || []).map((participant: any) => {
                    const participantId = String(getParticipantId(participant));
                    const participantIsAdmin = String(participant.role).toLowerCase() === "admin";
                    return (
                      <div key={participantId} className="flex items-center justify-between rounded-xl border bg-accent/10 px-3 py-2">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={getParticipantAvatar(participant) || ""} />
                            <AvatarFallback>{getParticipantName(participant)?.charAt(0) || "?"}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-bold text-primary">{getParticipantName(participant)}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[8px] uppercase">
                                {participant.role}
                              </Badge>
                              {participantId === String(user?.id) && (
                                <span className="text-[10px] text-muted-foreground">You</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {currentUserIsGroupAdmin && participantId !== String(user?.id) && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 rounded-xl"
                              onClick={() => handleSetRole(participantId, participantIsAdmin ? "member" : "admin")}
                              disabled={isUpdatingGroup}
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              {participantIsAdmin ? "Dismiss admin" : "Make admin"}
                            </Button>
                            {!participantIsAdmin && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 rounded-xl"
                                onClick={() => handleRemoveParticipant(participantId)}
                                disabled={isUpdatingGroup}
                              >
                                <UserX className="w-3.5 h-3.5" />
                                Remove
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Add related participant</p>
                <div className="flex gap-2">
                  <Select value={newParticipantId} onValueChange={setNewParticipantId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {addableParticipants.map((record) => (
                        <SelectItem key={record.id} value={String(record.id)}>
                          {record.name} ({record.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleAddParticipant}
                    disabled={!newParticipantId || isUpdatingGroup}
                    className="gap-2 rounded-xl"
                  >
                    {isUpdatingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden">
        <Card className={cn("w-full md:w-80 flex flex-col border-none shadow-sm shrink-0 overflow-hidden bg-white", selectedConv && "hidden md:flex")}>
          <CardHeader className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search conversations..." className="pl-9 bg-accent/30 border-none rounded-xl text-sm h-10" />
            </div>
          </CardHeader>
          <ScrollArea className="flex-1">
            {isLoadingConvs && (
              <div className="p-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary/30" />
              </div>
            )}
            {convsErrorMsg && !isLoadingConvs && (
              <div className="p-4 text-center space-y-3">
                <AlertCircle className="w-6 h-6 text-destructive mx-auto" />
                <p className="text-xs font-bold text-destructive">{translateText("Failed to load conversations")}</p>
                <p className="text-[10px] text-muted-foreground bg-destructive/5 rounded-lg p-2 text-left font-mono break-all">{convsErrorMsg}</p>
                <Button size="sm" variant="outline" onClick={loadConversations} className="gap-2">
                  <RefreshCw className="w-3 h-3" /> Retry
                </Button>
              </div>
            )}
            {!isLoadingConvs && !convsErrorMsg && conversations.length === 0 && (
              <div className="p-6 text-center space-y-2">
                <MessageCircle className="w-8 h-8 text-primary/20 mx-auto" />
                <p className="text-xs text-muted-foreground">{t("noConversations")}</p>
                <Button size="sm" variant="outline" onClick={handleOpenNewChat} className="gap-2 mt-2">
                  <Plus className="w-3 h-3" /> Start a chat
                </Button>
              </div>
            )}
            <div className="p-2 space-y-1">
              {conversations.map((conversation: any) => {
                const display = getConversationDisplay(conversation, user?.id);
                return (
                  <button
                    key={conversation.id}
                    onClick={() => setSelectedConv(conversation)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group",
                      selectedConv?.id === conversation.id ? "bg-primary text-white shadow-lg" : "hover:bg-accent/50"
                    )}
                  >
                    <Avatar className="h-10 w-10 border border-white/20">
                      <AvatarImage src={display.avatar || ""} />
                      <AvatarFallback>{display.name?.charAt(0) || "?"}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex justify-between items-baseline">
                        <span className="font-bold text-sm truncate">{display.name}</span>
                        {conversation.unread_count > 0 && (
                          <Badge className="h-4 w-4 p-0 text-[9px] bg-secondary text-primary border-none rounded-full justify-center">
                            {conversation.unread_count}
                          </Badge>
                        )}
                      </div>
                      <p className={cn("text-[10px] truncate", selectedConv?.id === conversation.id ? "text-white/70" : "text-muted-foreground")}>
                        {conversation.last_message ? translateText(conversation.last_message) : translateText("No messages yet")}
                      </p>
                      {conversation.conversation_type === "group" && (
                        <p className={cn("mt-1 text-[9px] uppercase font-black", selectedConv?.id === conversation.id ? "text-white/60" : "text-primary/40")}>
                          {conversation.subject_name || "Group"} {conversation.school_class_name ? `• ${conversation.school_class_name}` : ""}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </Card>

        <Card className={cn("flex-1 flex flex-col border-none shadow-sm relative overflow-hidden bg-white/50 rounded-[2rem]", !selectedConv && "hidden md:flex")}>
          {selectedConv ? (
            <>
              <div className="p-3 md:p-4 border-b flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSelectedConv(null)}>
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={currentConversationDisplay?.avatar || ""} />
                    <AvatarFallback>{currentConversationDisplay?.name?.charAt(0) || "?"}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-bold text-sm leading-tight text-primary">{currentConversationDisplay?.name}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[9px] text-muted-foreground uppercase font-black">{syncLabel}</p>
                      {selectedConv.only_admins_can_send && (
                        <Badge variant="outline" className="text-[8px] uppercase">
                          Admin-only
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedConv.conversation_type === "group" && currentUserIsGroupAdmin && (
                    <Button variant="ghost" size="icon" onClick={() => { setGroupSettingsOpen(true); loadComposerData(); }}>
                      <Settings2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 p-4 md:p-6" ref={scrollRef as any}>
                {isLoadingMsgs && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary/30" />
                  </div>
                )}
                {msgsErrorMsg && !isLoadingMsgs && (
                  <div className="flex flex-col items-center py-8 gap-3 px-4">
                    <AlertCircle className="w-8 h-8 text-destructive/30" />
                    <p className="text-xs font-bold text-destructive">{translateText("Failed to load messages")}</p>
                    <p className="text-[10px] text-muted-foreground bg-destructive/5 rounded-lg p-2 w-full font-mono break-all">{msgsErrorMsg}</p>
                    <Button size="sm" variant="outline" onClick={() => loadMessages(String(selectedConv.id))} className="gap-2">
                      <RefreshCw className="w-3 h-3" /> Retry
                    </Button>
                  </div>
                )}
                <div className="space-y-4">
                  {messages.map((message: any) => {
                    const isOwn = String(getMessageSenderId(message)) === String(user?.id);
                    const senderName = getMessageSenderName(message);
                    return (
                      <div key={message.id} className={cn("flex items-end gap-2", isOwn ? "flex-row-reverse" : "flex-row")}>
                        {!isOwn && (
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarImage src={getMessageSenderAvatar(message) || ""} />
                            <AvatarFallback className="text-[10px]">{senderName?.charAt(0)}</AvatarFallback>
                          </Avatar>
                        )}
                        <div className={cn("group relative max-w-[75%] space-y-1", isOwn ? "items-end" : "items-start")}>
                          {!isOwn && <p className="text-[9px] font-bold text-muted-foreground px-1">{senderName}</p>}
                          <div className={cn("flex items-center gap-1", isOwn ? "flex-row-reverse" : "flex-row")}>
                            <div
                              className={cn(
                                "px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words",
                                message.is_official
                                  ? "bg-primary/10 border border-primary/20 text-primary"
                                  : isOwn
                                    ? "bg-primary text-white rounded-br-sm"
                                    : "bg-white border border-accent text-primary rounded-bl-sm shadow-sm",
                                message._pending && "opacity-60"
                              )}
                            >
                              {translateText(message.text)}
                            </div>
                            {!message._pending && !message.is_deleted && (
                              <div className="relative">
                                <button
                                  type="button"
                                  aria-label="React"
                                  onClick={() => setReactionPickerFor((prev) => (prev === String(message.id) ? null : String(message.id)))}
                                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
                                >
                                  <Smile className="h-4 w-4" />
                                </button>
                                {reactionPickerFor === String(message.id) && (
                                  <div className={cn("absolute z-20 -top-10 flex gap-1 rounded-full border bg-white px-2 py-1 shadow-lg", isOwn ? "right-0" : "left-0")}>
                                    {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => handleReact(String(message.id), emoji)}
                                        className="text-lg transition-transform hover:scale-125"
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {Array.isArray(message.reactions) && message.reactions.length > 0 && (
                            <div className={cn("flex flex-wrap gap-1", isOwn ? "justify-end" : "justify-start")}>
                              {message.reactions.map((reaction: any) => (
                                <button
                                  key={reaction.emoji}
                                  type="button"
                                  onClick={() => handleReact(String(message.id), reaction.emoji)}
                                  className={cn(
                                    "flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition-colors",
                                    reaction.reacted ? "border-primary/40 bg-primary/10 text-primary" : "border-accent bg-white text-muted-foreground"
                                  )}
                                >
                                  <span>{reaction.emoji}</span>
                                  <span className="font-bold">{reaction.count}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <p className={cn("text-[9px] text-muted-foreground px-1", isOwn && "text-right")}>
                            {message.created_at ? new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="p-3 md:p-4 border-t bg-white shrink-0">
                {typingUsers.length > 0 && (
                  <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-medium text-muted-foreground">
                    <span className="flex gap-0.5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/50 [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/50 [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/50" />
                    </span>
                    {typingUsers.length === 1
                      ? `${typingUsers[0]} is typing…`
                      : `${typingUsers.slice(0, 2).join(", ")}${typingUsers.length > 2 ? " and others" : ""} are typing…`}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    value={messageText}
                    onChange={(event) => { setMessageText(event.target.value); pingTyping(); }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={
                      selectedConv.only_admins_can_send && !currentUserIsGroupAdmin
                        ? "Only admins can send messages in this group."
                        : "Type a message..."
                    }
                    className="flex-1 bg-accent/30 border-none rounded-2xl h-11 text-sm"
                    disabled={isSending || (selectedConv.only_admins_can_send && !currentUserIsGroupAdmin)}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!messageText.trim() || isSending || (selectedConv.only_admins_can_send && !currentUserIsGroupAdmin)}
                    size="icon"
                    className="h-11 w-11 rounded-2xl bg-primary text-white shadow-lg shrink-0"
                  >
                    {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 p-8">
              <div className="p-6 bg-primary/5 rounded-full">
                <MessageCircle className="w-12 h-12 text-primary/20" />
              </div>
              <div>
                <h3 className="font-bold text-primary">Select a Conversation</h3>
                <p className="text-sm text-muted-foreground mt-1">Choose from your conversations on the left, or start a new one.</p>
              </div>
              <Button onClick={handleOpenNewChat} className="gap-2 rounded-xl" variant="outline">
                <Plus className="w-4 h-4" /> New Chat
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
