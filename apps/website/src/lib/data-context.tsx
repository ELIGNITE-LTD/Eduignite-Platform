"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import type { Feedback, Order, Announcement, PersonalChat, SupportContribution, StaffRemark } from "./auth-context";

interface DataContextType {
  feedbacks: Feedback[];
  orders: Order[];
  announcements: Announcement[];
  personalChats: PersonalChat[];
  supportContributions: SupportContribution[];
  staffRemarks: StaffRemark[];
  addFeedback: (feedback: Omit<Feedback, "id" | "status" | "createdAt">) => void;
  resolveFeedback: (id: string) => void;
  deleteFeedback: (id: string) => void;
  addOrder: (order: Omit<Order, "id" | "status" | "createdAt">) => void;
  processOrder: (id: string) => void;
  deleteOrder: (id: string) => void;
  addAnnouncement: (ann: Omit<Announcement, "id" | "createdAt">) => void;
  deleteAnnouncement: (id: string) => void;
  addSupport: (contribution: Omit<SupportContribution, "id" | "status" | "createdAt">) => void;
  verifySupport: (id: string) => void;
  deleteSupport: (id: string) => void;
  addStaffRemark: (remark: Omit<StaffRemark, "id" | "date">) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [personalChats, setPersonalChats] = useState<PersonalChat[]>([]);
  const [supportContributions, setSupportContributions] = useState<SupportContribution[]>([]);
  const [staffRemarks, setStaffRemarks] = useState<StaffRemark[]>([]);

  useEffect(() => {
    const load = (key: string, defaultValue: any) => {
      const saved = localStorage.getItem(`eduignite_${key}`);
      if (saved) { try { return JSON.parse(saved); } catch { /* ignore */ } }
      return defaultValue;
    };
    setFeedbacks(load("feedbacks", []));
    setOrders(load("orders", []));
    setAnnouncements(load("announcements", []));
    setPersonalChats(load("personal_chats", []));
    setSupportContributions(load("support", []));
    setStaffRemarks(load("staff_remarks", []));
  }, []);

  useEffect(() => {
    localStorage.setItem("eduignite_feedbacks", JSON.stringify(feedbacks));
    localStorage.setItem("eduignite_orders", JSON.stringify(orders));
    localStorage.setItem("eduignite_announcements", JSON.stringify(announcements));
    localStorage.setItem("eduignite_personal_chats", JSON.stringify(personalChats));
    localStorage.setItem("eduignite_support", JSON.stringify(supportContributions));
    localStorage.setItem("eduignite_staff_remarks", JSON.stringify(staffRemarks));
  }, [feedbacks, orders, announcements, personalChats, supportContributions, staffRemarks]);

  const addFeedback = (f: Omit<Feedback, "id" | "status" | "createdAt">) => setFeedbacks(prev => [{ ...f, id: `FB-${Math.random().toString(36).substr(2, 5).toUpperCase()}`, status: "New", createdAt: new Date() }, ...prev]);
  const resolveFeedback = (id: string) => setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, status: "Resolved" } : f));
  const deleteFeedback = (id: string) => setFeedbacks(prev => prev.filter(f => f.id !== id));

  const addOrder = (o: Omit<Order, "id" | "status" | "createdAt">) => setOrders(prev => [{ ...o, id: `ORD-${Math.random().toString(36).substr(2, 5).toUpperCase()}`, status: "pending", createdAt: new Date() }, ...prev]);
  const processOrder = (id: string) => setOrders(prev => prev.map(o => o.id === id ? { ...o, status: "processed" } : o));
  const deleteOrder = (id: string) => setOrders(prev => prev.filter(o => o.id !== id));

  const addAnnouncement = (a: Omit<Announcement, "id" | "createdAt">) => setAnnouncements(prev => [{ ...a, id: Math.random().toString(), createdAt: new Date() }, ...prev]);
  const deleteAnnouncement = (id: string) => setAnnouncements(prev => prev.filter(a => a.id !== id));

  const addSupport = (c: Omit<SupportContribution, "id" | "status" | "createdAt">) => setSupportContributions(prev => [{ ...c, id: `SUP-${Math.random().toString(36).substr(2, 5).toUpperCase()}`, status: "New", createdAt: new Date() }, ...prev]);
  const verifySupport = (id: string) => {
    setSupportContributions(prev => prev.map(c => {
      if (c.id === id) {
        setPersonalChats(pc => [...pc, {
          id: `MSG-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          senderId: "system", senderName: "Platform Team",
          senderRole: "SYSTEM", senderAvatar: "",
          receiverId: c.uid, text: `Hello ${c.userName}, your contribution has been verified.`,
          timestamp: new Date().toLocaleTimeString(), isOfficial: true
        }]);
        return { ...c, status: "Verified" };
      }
      return c;
    }));
  };
  const deleteSupport = (id: string) => setSupportContributions(prev => prev.filter(c => c.id !== id));

  const addStaffRemark = (r: Omit<StaffRemark, "id" | "date">) => {
    setStaffRemarks(prev => [{ ...r, id: `REM-${Math.random().toString(36).substr(2, 5).toUpperCase()}`, date: new Date().toLocaleDateString() }, ...prev]);
  };

  return (
    <DataContext.Provider value={{
      feedbacks, orders, announcements, personalChats, supportContributions, staffRemarks,
      addFeedback, resolveFeedback, deleteFeedback, addOrder, processOrder, deleteOrder,
      addAnnouncement, deleteAnnouncement, addSupport, verifySupport, deleteSupport, addStaffRemark,
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) throw new Error("useData must be used within a DataProvider");
  return context;
};
