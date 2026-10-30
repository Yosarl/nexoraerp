var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { contextBridge, ipcRenderer } from 'electron';
// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // App info
    getVersion: function () { return ipcRenderer.invoke('get-version'); },
    getPlatform: function () { return process.platform; },
    // Window controls
    minimizeWindow: function () { return ipcRenderer.send('minimize-window'); },
    maximizeWindow: function () { return ipcRenderer.send('maximize-window'); },
    closeWindow: function () { return ipcRenderer.send('close-window'); },
    getPrinters: function () { return ipcRenderer.invoke('get-printers'); },
    // IPC communication
    send: function (channel) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        var validChannels = ['toMain'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send.apply(ipcRenderer, __spreadArray([channel], args, false));
        }
    },
    on: function (channel, callback) {
        var validChannels = ['fromMain'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, function (_event) {
                var args = [];
                for (var _i = 1; _i < arguments.length; _i++) {
                    args[_i - 1] = arguments[_i];
                }
                return callback.apply(void 0, args);
            });
        }
    },
});
