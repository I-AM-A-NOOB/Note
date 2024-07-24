# VEX

## 面向对象
```C++
#include "vex.h"

  

using namespace vex;

  

// A global instance of competition

competition Competition;

brain Brain;

motor mymotor = motor(PORT10, ratio18_1, true)
```
`motor(...)`：构造函数
```C++
int main()

{

  // Set up callbacks for autonomous and driver control periods.

  Competition.autonomous(autonomous);

  Competition.drivercontrol(usercontrol);

  Brain.Screen.setCursor(2, 1);

  Brain.Screen.print("114514");

  

  // Run the pre-autonomous function.

  pre_auton();

  

  // Prevent main from exiting with an infinite loop.

  while (true)

  {

    wait(100, msec);

  }

}
```
不希望退出