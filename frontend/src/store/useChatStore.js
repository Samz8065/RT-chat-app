import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
      console.log(res);
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      set({ messages: res.data });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    try {
      const res = await axiosInstance.post(
        `/messages/send/${selectedUser._id}`,
        messageData
      );
      set({ messages: [...messages, res.data] });
    } catch (error) {
      toast.error(error.response.data.message);
    }
  },

  subscribeToMessages: () => {
    const { selectedUser } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    // Remove any existing listeners first
    socket.off("newMessage");

    socket.on("newMessage", (newMessage) => {
      const { selectedUser: currentSelectedUser, messages } = get();
      
      // Handle both populated and non-populated senderId
      const senderId = typeof newMessage.senderId === 'object' ? newMessage.senderId._id : newMessage.senderId;
      const receiverId = typeof newMessage.receiverId === 'object' ? newMessage.receiverId._id : newMessage.receiverId;
      
      // Only add message if it's for the currently selected user (either sent by or received by)
      if (currentSelectedUser && 
          (senderId === currentSelectedUser._id || 
           receiverId === currentSelectedUser._id)) {
        
        // Check if message already exists to prevent duplicates
        const messageExists = messages.some(msg => msg._id === newMessage._id);
        if (!messageExists) {
          set({ messages: [...messages, newMessage] });
        }
      }
    });
  },

  unSubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    socket.off("newMessage");
  },

  setSelectedUser: (selectedUser) => {
    set({ selectedUser, messages: [] });
  },
}));
