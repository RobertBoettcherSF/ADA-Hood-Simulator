with Hood.Population.Crews;
with Hood.Population.Week;

package body Hood.Population.Commands is

   use Hood.Population.Orders;
   use type Hood.Units.Units;
   use Hood.Population.Crews;

   Cell_Units : constant := 54 * Hood.Units.Scale;

   function Y (Kind : Reply_Kind; A, B, C, D : Integer_32 := 0) return Reply is ((Kind, A, B, C, D));

   function Free_Order_Slot (S : Population_State) return Integer_32 is
   begin
      for K in S.Orders'Range loop
         if S.Orders (K).Gang = 0 then
            return K;
         end if;
      end loop;
      return No_Id;
   end Free_Order_Slot;

   procedure Issue
     (S     : in out Population_State;
      C     : Hood.City.City_State;
      G     : Gang_Id;
      Input : Orders.Order_Input;
      R     : out Reply;
      Kept  : out Target_List;
      Kept_Count : out Integer_32;
      Slot  : out Integer_32)
   is
      Cs   : constant Integer_32 := Input.Crew;
      D    : Def_Rec;
      Lt   : Integer_32;
      Ids  : Target_List;
      N    : Integer_32;
      O    : Order_Rec;
      Price, Free_Cash : Integer_32;
   begin
      Kept := [others => No_Id];
      Kept_Count := 0;
      Slot := No_Id;
      if Cs not in S.Crews'Range or else S.Crews (Cs).Gang /= G then
         R := Y (Y_No_Crew);
         return;
      end if;
      Lt := S.Crews (Cs).Lieutenant;
      if not Lieutenant_Ok (S, Cs) then
         R := Y (Y_Lt_Unavailable);
         return;
      end if;
      D := Defs (Input.Kind);
      if Input.Manpower < 1 then
         R := Y (Y_Positive_Whole);
         return;
      end if;
      if Input.Manpower > S.Crews (Cs).Count + 1 then
         R := Y (Y_Only_People, Lt, S.Crews (Cs).Count + 1);
         return;
      end if;
      if Input.Manpower > D.Max_Men then
         R := Y (Y_At_Most, Order_Kind'Pos (Input.Kind), D.Max_Men);
         return;
      end if;
      declare
         Why : constant Line_Rec := Staffing_Reason (S, C, Cs, Input.Kind, Input.Manpower);
      begin
         if Why.Kind /= L_None then
            R := Y (Y_Staffing, Line_Kind'Pos (Why.Kind), Why.A, Why.B, Why.C);
            return;
         end if;
      end;
      if Input.Amount < -1 then
         R := Y (Y_Valid_Amount);
         return;
      end if;
      if Input.Kind = O_Donate and then Input.Amount = 0 then
         R := Y (Y_Donation_Zero);
         return;
      end if;
      if Input.Kind = O_Clear_Streets then
         R := Y (Y_Streets);  --  nobody is bribed before item 8
         return;
      end if;
      if Input.Level < -1 or else Input.Level > 200 then
         R := Y (Y_Rate);
         return;
      end if;
      for K in 1 .. Integer (Input.Block_Count) loop
         if Input.Blocks (K) not in 0 .. C.Block_Count - 1 then
            R := Y (Y_No_Block);
            return;
         end if;
      end loop;
      for K in 1 .. Integer (Input.Picked_Count) loop
         if Input.Picked (K) not in 0 .. C.Building_Count - 1 then
            R := Y (Y_No_Site);
            return;
         end if;
      end loop;
      if D.Target = On_Building
        and then (Input.Picked_Count /= 1
                  or else not Valid_Building (S, C, G, Input.Kind, Input.Picked (1), Input.Business, Input.Front))
      then
         R := Y (Y_Valid_Site);
         return;
      end if;
      if D.Target = On_Area then
         for K in 1 .. Integer (Input.Picked_Count) loop
            if not Valid_Area (S, C, G, Input.Kind, Input.Picked (K)) then
               R := Y (Y_Site_Not_Valid);
               return;
            end if;
         end loop;
      end if;
      if D.Target = On_Point
        and then (not Input.Has_Point or else Input.PX < 0 or else Input.PY < 0
                  or else Block_At (C, Integer_32 (Input.PX / Cell_Units), Integer_32 (Input.PY / Cell_Units)) = No_Id)
      then
         R := Y (Y_Inside_City);
         return;
      end if;
      Expand (S, C, G, Input, Ids, N);
      if D.Target = On_Area and then N = 0 then
         R := Y (Y_Nothing_There);
         return;
      end if;
      Draft (S, C, G, Input, No_Id, O);
      Price :=
        (case Input.Kind is
            when O_Buy      => (if N > 0 then Building_Value (S, C, Ids (1)) else 0),
            when O_Set_Up   => (if Input.Business in Listed_Type then Type_Cost (Input.Business) else 0),
            when O_Donate   => Integer_32'Max (0, O.Amount),
            when O_Clean_Up => O.Target_Count * Cleanup_Cost,
            when others     => 0);
      Free_Cash := S.Gangs (G).Cash - Committed_Cash (S, C, G, No_Id);
      if Price > Free_Cash then
         R := Y (Y_Cannot_Afford, Price, Integer_32'Max (0, Free_Cash));
         return;
      end if;
      if not Has_Time (S, C, Cs, O, No_Id) then
         if D.Target = On_Area and then O.Target_Count > 1 then
            Trim_To_Week (S, C, Cs, O, Kept, Kept_Count);
            if Kept_Count > 0 then
               R := Y (Y_No_Time_Trim, Lt, O.Target_Count, Kept_Count);
               return;
            end if;
         end if;
         R := Y (Y_No_Time, Lt);
         return;
      end if;
      Slot := Free_Order_Slot (S);
      if Slot = No_Id or else S.Crews (Cs).Order_Count >= Max_Crew_Orders then
         Slot := No_Id;
         R := Y (Y_Too_Many_Orders);
         return;
      end if;
      O.Id := S.Next_Id;
      S.Next_Id := S.Next_Id + 1;
      S.Orders (Slot) := O;
      S.Crews (Cs).Order_Count := S.Crews (Cs).Order_Count + 1;
      S.Crews (Cs).Orders (Integer (S.Crews (Cs).Order_Count)) := Slot;
      Sync_Time (S, C, Cs);
      R := Y (Y_Accepted, Lt);
   end Issue;

   procedure Cancel (S : in out Population_State; C : Hood.City.City_State; G : Gang_Id;
                     Order : Integer_32; R : out Reply)
   is
      Cs : Integer_32;
      N  : Integer_32 := 0;
      P  : Integer_32;
   begin
      if Order not in S.Orders'Range or else S.Orders (Order).Gang /= G then
         R := Y (Y_No_Order);
         return;
      end if;
      Cs := S.Orders (Order).Crew;
      if Cs in S.Crews'Range and then S.Crews (Cs).Gang = G then
         for K in 1 .. Integer (S.Crews (Cs).Order_Count) loop
            if S.Crews (Cs).Orders (K) /= Order then
               N := N + 1;
               S.Crews (Cs).Orders (Integer (N)) := S.Crews (Cs).Orders (K);
            end if;
         end loop;
         for K in Integer (N) + 1 .. Max_Crew_Orders loop
            S.Crews (Cs).Orders (K) := No_Id;
         end loop;
         S.Crews (Cs).Order_Count := N;
         Sync_Time (S, C, Cs);
      end if;
      for K in 1 .. Integer (S.Orders (Order).Assigned_Count) loop
         P := S.Orders (Order).Assigned (K);
         if P /= No_Id and then S.People (P).Order = Order then
            S.People (P).Order := No_Id;
            S.People (P).Walking := False;
            Send_Home (S, C, P);
         end if;
      end loop;
      S.Orders (Order).State := Cancelled;
      S.Orders (Order).Gang := 0;
      R := Y (Y_Cancelled);
   end Cancel;

   procedure Set_Pay (S : in out Population_State; G : Gang_Id; Person, Pay : Integer_32; R : out Reply) is
      Before : Integer_32;
   begin
      if Person not in 0 .. S.Count - 1 or else S.People (Person).Gang /= G then
         R := Y (Y_No_Person);
         return;
      end if;
      Before := S.People (Person).Pay;
      S.People (Person).Pay := Integer_32'Max (0, Pay);
      if S.People (Person).Pay < Before then
         S.People (Person).Loyalty := Integer_32'Max (0, S.People (Person).Loyalty - 6 * Loyalty_Per_Percent);
      elsif S.People (Person).Pay >= S.People (Person).Demand then
         S.People (Person).Loyalty :=
           Integer_32'Min (Loyalty_Full, S.People (Person).Loyalty + 4 * Loyalty_Per_Percent);
      end if;
      R := Y (Y_Done);
   end Set_Pay;

   procedure Sack (S : in out Population_State; G : Gang_Id; Person : Integer_32; R : out Reply) is
   begin
      if Person not in 0 .. S.Count - 1 or else S.People (Person).Gang /= G
        or else Person = S.Gangs (G).Boss
      then
         R := Y (Y_No_Person);
         return;
      end if;
      Hood.Population.Week.Defect (S, Person);
      S.People (Person).Opinion (G) :=
        Integer_8 (Integer_32'Min (-40, Integer_32 (S.People (Person).Opinion (G)) - 40));
      R := Y (Y_Back_On_Street, Person);
   end Sack;

   function In_Crew_Or_Pool (S : Population_State; G : Gang_Id; Person : Integer_32) return Boolean is
      Cs : constant Integer_32 := Crew_Of (S, Person);
   begin
      if In_Pool (S, G, Person) then
         return True;
      end if;
      if Cs = No_Id or else S.Crews (Cs).Gang /= G then
         return False;
      end if;
      for K in 1 .. Integer (S.Crews (Cs).Count) loop
         if S.Crews (Cs).Members (K) = Person then
            return True;
         end if;
      end loop;
      return False;
   end In_Crew_Or_Pool;

   procedure Step_Out_Of_Office (S : in out Population_State; C : Hood.City.City_State; P : Integer_32) is
      B : constant Integer_32 := S.People (P).Building;
   begin
      if B /= No_Id and then S.People (P).Gang /= 0 and then Live (C, B)
        and then C.Buildings (B).Kind_Of = T_Office and then S.Extra (B).Owner_Gang = S.People (P).Gang
      then
         S.People (P).Building := No_Id;
      end if;
   end Step_Out_Of_Office;

   procedure Promote (S : in out Population_State; C : Hood.City.City_State; G : Gang_Id;
                      Person : Integer_32; R : out Reply)
   is
      Slot  : Integer_32;
      Quote : Integer_32;
      Old   : Integer_32;
   begin
      if Person not in 0 .. S.Count - 1 or else S.People (Person).Gang /= G
        or else S.People (Person).Kind /= R_Hood
      then
         R := Y (Y_Choose_Hood);
         return;
      end if;
      if not In_Crew_Or_Pool (S, G, Person) then
         R := Y (Y_Not_In_Pool);
         return;
      end if;
      if S.Gangs (G).Crew_Total >= Max_Gang_Crews then
         R := Y (Y_Max_Lieutenants, Max_Gang_Crews);
         return;
      end if;
      Old := Crew_Of (S, Person);
      New_Crew (S, G, Person, Slot);
      if Slot = No_Id then
         R := Y (Y_Could_Not_Promote);
         return;
      end if;
      Step_Out_Of_Office (S, C, Person);
      --  setLieutenantPay
      if C.Standard then
         Quote := Wage_Quote (S.People (Person), G);
         if Quote > S.People (Person).Demand + 20 then
            S.People (Person).Demand := Quote;
         end if;
      else
         S.People (Person).Demand :=
           Integer_32'Max (S.People (Person).Demand, Pay_Demand (S.People (Person), R_Lieutenant));
      end if;
      S.People (Person).Pay := S.People (Person).Demand;
      if Old /= No_Id and then S.Crews (Old).Gang = G then
         Retime (S, C, Old);
      end if;
      R := Y (Y_Promoted, Person);
   end Promote;

   procedure Demote (S : in out Population_State; G : Gang_Id; Crew : Integer_32; R : out Reply) is
      Lt : Integer_32;
   begin
      if Crew not in S.Crews'Range or else S.Crews (Crew).Gang /= G then
         R := Y (Y_No_Crew);
         return;
      end if;
      Lt := S.Crews (Crew).Lieutenant;
      Disband (S, Crew, True);
      if Lt /= No_Id then
         S.People (Lt).Loyalty := Integer_32'Max (0, S.People (Lt).Loyalty - 10 * Loyalty_Per_Percent);
      end if;
      R := Y (Y_Broken_Up);
   end Demote;

   procedure Move_To_Crew (S : in out Population_State; C : Hood.City.City_State; G : Gang_Id;
                           Person, Crew : Integer_32; R : out Reply)
   is
      Old : Integer_32;
   begin
      if Crew not in S.Crews'Range or else S.Crews (Crew).Gang /= G
        or else Person not in 0 .. S.Count - 1 or else S.People (Person).Gang /= G
        or else S.People (Person).Kind /= R_Hood
      then
         R := Y (Y_Choose_Hood_Crew);
         return;
      end if;
      if not In_Crew_Or_Pool (S, G, Person) then
         R := Y (Y_Not_In_Pool);
         return;
      end if;
      Old := Crew_Of (S, Person);
      if Old = Crew then
         R := Y (Y_Already_In, Person, Crew);
         return;
      end if;
      if S.Crews (Crew).Count >= Max_Crew_Members then
         R := Y (Y_Crew_Full);
         return;
      end if;
      if Old /= No_Id then
         Remove_Member (S, Old, Person);
      end if;
      Leave_Pool (S, G, Person);
      Add_Member (S, Crew, Person);
      Step_Out_Of_Office (S, C, Person);
      if Old /= No_Id then
         Retime (S, C, Old);
      end if;
      Retime (S, C, Crew);
      R := Y (Y_Joined, Person, Crew);
   end Move_To_Crew;

   procedure Move_To_Pool (S : in out Population_State; C : Hood.City.City_State; G : Gang_Id;
                           Person : Integer_32; R : out Reply)
   is
      Old : Integer_32;
   begin
      if Person not in 0 .. S.Count - 1 or else S.People (Person).Gang /= G
        or else S.People (Person).Kind /= R_Hood
      then
         R := Y (Y_Choose_Crew_Hood);
         return;
      end if;
      if not In_Crew_Or_Pool (S, G, Person) then
         R := Y (Y_Not_In_Pool);
         return;
      end if;
      Old := Crew_Of (S, Person);
      if Old /= No_Id then
         Remove_Member (S, Old, Person);
      end if;
      S.People (Person).Team := No_Id;
      Join_Pool (S, G, Person);
      if Old /= No_Id then
         Retime (S, C, Old);
      end if;
      R := Y (Y_Done);
   end Move_To_Pool;

   procedure Buy_Vehicle
     (S : in out Population_State; C : Hood.City.City_State; G : Gang_Id;
      Kind : Vehicle_Kind; Crew : Integer_32; R : out Reply)
   is
      Cost : constant Integer_32 :=
        (case Kind is when V_Speedster => 5_000, when V_Coupe | V_Truck => 3_000);
   begin
      if Crew /= No_Id and then (Crew not in S.Crews'Range or else S.Crews (Crew).Gang /= G) then
         R := Y (Y_No_Crew);
         return;
      end if;
      if S.Gangs (G).Cash < Cost then
         R := Y (Y_Cannot_Afford_It);
         return;
      end if;
      S.Gangs (G).Cash := S.Gangs (G).Cash - Cost;
      S.Gangs (G).Purchases := S.Gangs (G).Purchases + Cost;
      if Crew /= No_Id then
         case Kind is
            when V_Speedster => S.Crews (Crew).Speedsters := S.Crews (Crew).Speedsters + 1;
            when V_Coupe     => S.Crews (Crew).Coupes := S.Crews (Crew).Coupes + 1;
            when V_Truck     => S.Crews (Crew).Trucks := S.Crews (Crew).Trucks + 1;
         end case;
         Retime (S, C, Crew);
      else
         case Kind is
            when V_Speedster => S.Gangs (G).Speedsters := S.Gangs (G).Speedsters + 1;
            when V_Coupe     => S.Gangs (G).Coupes := S.Gangs (G).Coupes + 1;
            when V_Truck     => S.Gangs (G).Trucks := S.Gangs (G).Trucks + 1;
         end case;
      end if;
      R := Y (Y_Bought, Vehicle_Kind'Pos (Kind));
   end Buy_Vehicle;

end Hood.Population.Commands;
