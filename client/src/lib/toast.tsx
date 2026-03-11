import Toast from 'react-native-toast-message';

export const toast = {
    success: (message: string, title = 'Success') => {
        Toast.show({
            type: 'success',
            text1: title,
            text2: message,
            position: 'top',
            visibilityTime: 3000,
        });
    },
    error: (message: string, title = 'Error') => {
        Toast.show({
            type: 'error',
            text1: title,
            text2: message,
            position: 'top',
            visibilityTime: 4000,
        });
    },
    info: (message: string, title = 'Info') => {
        Toast.show({
            type: 'info',
            text1: title,
            text2: message,
            position: 'top',
            visibilityTime: 3000,
        });
    },
};