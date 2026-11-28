/****************************************************************************
 Copyright (c) 2013 cocos2d-x.org
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

#import "ViewController.h"
#import "AppDelegate.h"
#import "platform/ios/AppDelegateBridge.h"
#import <CoreHaptics/CoreHaptics.h>
//#include "cocos/platform/Device.h"

namespace {
//    cc::Device::Orientation _lastOrientation;

/** A rumble `duration` long at `intensity`, fading to none when `fades`. */
CHHapticPattern *rumblePattern(NSTimeInterval duration, float intensity, BOOL fades, NSError **error) {
    CHHapticEventParameter *strength = [[[CHHapticEventParameter alloc]
        initWithParameterID:CHHapticEventParameterIDHapticIntensity value:intensity] autorelease];
    CHHapticEventParameter *sharpness = [[[CHHapticEventParameter alloc]
        initWithParameterID:CHHapticEventParameterIDHapticSharpness value:0.3] autorelease];
    CHHapticEvent *event = [[[CHHapticEvent alloc] initWithEventType:CHHapticEventTypeHapticContinuous
        parameters:@[strength, sharpness] relativeTime:0 duration:duration] autorelease];
    NSArray<CHHapticParameterCurve *> *curves = @[];
    if (fades) {
        CHHapticParameterCurveControlPoint *start = [[[CHHapticParameterCurveControlPoint alloc]
            initWithRelativeTime:0 value:1.0] autorelease];
        CHHapticParameterCurveControlPoint *end = [[[CHHapticParameterCurveControlPoint alloc]
            initWithRelativeTime:duration value:0.0] autorelease];
        curves = @[[[[CHHapticParameterCurve alloc] initWithParameterID:CHHapticDynamicParameterIDHapticIntensityControl
            controlPoints:@[start, end] relativeTime:0] autorelease]];
    }
    return [[[CHHapticPattern alloc] initWithEvents:@[event] parameterCurves:curves error:error] autorelease];
}

/**
 * Core Haptics' engine, running; nil where the device has none. Making and starting it takes about 50 ms on the main
 * thread, the game's, so the view controller does it as the app starts rather than at the first explosion. Once it
 * runs, a start costs nothing, and one stopped since starts again.
 */
API_AVAILABLE(ios(13.0)) CHHapticEngine *rumbleEngine() {
    if (![CHHapticEngine capabilitiesForHardware].supportsHaptics) return nil;
    static CHHapticEngine *engine;
    NSError *error = nil;
    if (!engine) {
        engine = [[CHHapticEngine alloc] initAndReturnError:&error];
        engine.playsHapticsOnly = YES;
        engine.autoShutdownEnabled = YES;
    }
    if (!engine || ![engine startAndReturnError:&error]) {
        NSLog(@"[Haptics] Failed to start: %@", error);
        return nil;
    }
    return engine;
}

/** The rumbles, with Core Haptics: an explosion's 0.28 s from full intensity to none, a pulse's 0.15 s held at 0.35. */
void playRumble(NSString *style) {
    if (@available(iOS 13.0, *)) {
        CHHapticEngine *engine = rumbleEngine();
        if (!engine) return;
        static NSMutableDictionary<NSString *, CHHapticPattern *> *patterns;
        static id<CHHapticPatternPlayer> player;
        NSError *error = nil;
        if (!patterns) patterns = [[NSMutableDictionary alloc] init];
        CHHapticPattern *pattern = patterns[style];
        if (!pattern) {
            pattern = [style isEqualToString:@"explosion"] ? rumblePattern(0.28, 1.0, YES, &error) : rumblePattern(0.15, 0.35, NO, &error);
            if (pattern) patterns[style] = pattern;
        }
        if (player) [player stopAtTime:CHHapticTimeImmediate error:nil];
        [player release];
        player = pattern ? [[engine createPlayerWithPattern:pattern error:&error] retain] : nil;
        if (!player || ![player startAtTime:CHHapticTimeImmediate error:&error]) {
            NSLog(@"[Haptics] Failed to play %@: %@", style, error);
        }
    }
}
}

@interface ViewController ()
 
@end

@implementation ViewController

- (instancetype)init {
    if ((self = [super init])) {
        // The rumbles' engine, ready before the first explosion (rumbleEngine).
        if (@available(iOS 13.0, *)) rumbleEngine();
    }
    return self;
}

+ (void)playHapticFeedback:(NSString *)style {
    void (^feedback)(void) = ^{
        if ([UIApplication sharedApplication].applicationState != UIApplicationStateActive) return;
        if ([style isEqualToString:@"explosion"] || [style isEqualToString:@"pulse"]) { playRumble(style); return; }
        // Keep generators alive so repeated interactions do not recreate the haptic engine.
        static UIImpactFeedbackGenerator *light;
        static UIImpactFeedbackGenerator *medium;
        static UIImpactFeedbackGenerator *heavy;
        UIImpactFeedbackGenerator *generator;
        if ([style isEqualToString:@"light"]) {
            if (!light) light = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleLight];
            generator = light;
        } else if ([style isEqualToString:@"medium"]) {
            if (!medium) medium = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleMedium];
            generator = medium;
        } else if ([style isEqualToString:@"heavy"]) {
            if (!heavy) heavy = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleHeavy];
            generator = heavy;
        } else return;
        [generator impactOccurred];
        [generator prepare];
    };
    if ([NSThread isMainThread]) feedback();
    else dispatch_async(dispatch_get_main_queue(), feedback);
}


- (BOOL) shouldAutorotate {
    return YES;
}

- (UIInterfaceOrientationMask)supportedInterfaceOrientations {
    return UIInterfaceOrientationMaskLandscape;
}

- (UIInterfaceOrientation)preferredInterfaceOrientationForPresentation {
    return UIInterfaceOrientationLandscapeRight;
}

//fix not hide status on ios7
- (BOOL)prefersStatusBarHidden {
    return YES;
}

// Controls the application's screen edge gesture delay to prevent accidental touches
- (UIRectEdge)preferredScreenEdgesDeferringSystemGestures
{
    return UIRectEdgeAll;
}

// Controls the application's preferred home indicator auto-showing otherwise preferredScreenEdgesDeferringSystemGestures is invalidation
- (BOOL)prefersHomeIndicatorAutoHidden {
    return NO;
}

- (void)viewWillTransitionToSize:(CGSize)size withTransitionCoordinator:(id<UIViewControllerTransitionCoordinator>)coordinator {
   AppDelegate* delegate = [[UIApplication sharedApplication] delegate];
   [delegate.appDelegateBridge viewWillTransitionToSize:size withTransitionCoordinator:coordinator];
   float pixelRatio = [delegate.appDelegateBridge getPixelRatio];

   //CAMetalLayer is available on ios8.0, ios-simulator13.0.
   CAMetalLayer *layer = (CAMetalLayer *)self.view.layer;
   CGSize tsize             = CGSizeMake(static_cast<int>(size.width * pixelRatio),
                                         static_cast<int>(size.height * pixelRatio));
   layer.drawableSize = tsize;
}

@end
