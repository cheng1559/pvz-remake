/****************************************************************************
 Copyright (c) 2010-2013 cocos2d-x.org
 Copyright (c) 2013-2016 Chukong Technologies Inc.
 Copyright (c) 2017-2022 Xiamen Yaji Software Co., Ltd.

 http://www.cocos.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
 worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
 not use Cocos Creator software for developing other software or tools that's
 used for developing games. You are not granted to publish, distribute,
 sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
****************************************************************************/

#import "AppDelegate.h"
#import "ViewController.h"
#import "View.h"

#import "service/SDKWrapper.h"

@interface AppDelegate ()
- (void)connectWindowScene:(UIWindowScene *)scene;
@end

@interface GameSceneDelegate : NSObject <UIWindowSceneDelegate>
@end

@implementation AppDelegate
@synthesize window;
@synthesize appDelegateBridge;

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    [[SDKWrapper shared] application:application didFinishLaunchingWithOptions:launchOptions];
    return YES;
}

- (void)connectWindowScene:(UIWindowScene *)scene {
    // Cocos reads the window from UIApplication.delegate and owns one game loop per process.
    if (self.window) {
        self.window.windowScene = scene;
        [self.window makeKeyAndVisible];
        return;
    }

    self.window = [[[UIWindow alloc] initWithWindowScene:scene] autorelease];
    appDelegateBridge = [[AppDelegateBridge alloc] init];
    _viewController = [[ViewController alloc] init];
    _viewController.view = [[[View alloc] initWithFrame:self.window.bounds] autorelease];
    _viewController.view.contentScaleFactor = scene.screen.scale;
    _viewController.view.multipleTouchEnabled = YES;
    self.window.rootViewController = _viewController;
    [self.window makeKeyAndVisible];
    [appDelegateBridge application:UIApplication.sharedApplication didFinishLaunchingWithOptions:nil];
}

- (void)applicationWillTerminate:(UIApplication *)application {
    [[SDKWrapper shared] applicationWillTerminate:application];
    [appDelegateBridge applicationWillTerminate:application];
}

- (void)applicationDidReceiveMemoryWarning:(UIApplication *)application {
    [[SDKWrapper shared] applicationDidReceiveMemoryWarning:application];
}
@end

@implementation GameSceneDelegate
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
    AppDelegate *app = (AppDelegate *)UIApplication.sharedApplication.delegate;
    [app connectWindowScene:(UIWindowScene *)scene];
}

- (void)sceneDidDisconnect:(UIScene *)scene {
    UIWindow *window = UIApplication.sharedApplication.delegate.window;
    if (window.windowScene == scene) window.windowScene = nil;
}

- (void)sceneDidBecomeActive:(UIScene *)scene {
    UIApplication *application = UIApplication.sharedApplication;
    [[SDKWrapper shared] applicationDidBecomeActive:application];
    [((AppDelegate *)application.delegate).appDelegateBridge applicationDidBecomeActive:application];
}

- (void)sceneWillResignActive:(UIScene *)scene {
    UIApplication *application = UIApplication.sharedApplication;
    [[SDKWrapper shared] applicationWillResignActive:application];
    [((AppDelegate *)application.delegate).appDelegateBridge applicationWillResignActive:application];
}

- (void)sceneWillEnterForeground:(UIScene *)scene {
    [[SDKWrapper shared] applicationWillEnterForeground:UIApplication.sharedApplication];
}

- (void)sceneDidEnterBackground:(UIScene *)scene {
    [[SDKWrapper shared] applicationDidEnterBackground:UIApplication.sharedApplication];
}
@end
